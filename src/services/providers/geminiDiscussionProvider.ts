import { IDiscussionProvider, DiscussionContext } from '@/types/providers';
import { Participant, TranscriptTurn } from '@/types/session';
import { MODERATOR } from '@/constants/participants';

let turnIdCounter = 0;
function createTurnId(): string {
  turnIdCounter += 1;
  return `turn-ai-${Date.now()}-${turnIdCounter}`;
}

export class GeminiDiscussionProvider implements IDiscussionProvider {
  public readonly name = 'Google Gemini LLM Provider';
  public readonly isDemo = false;

  private async callTurnEndpoint(
    context: DiscussionContext,
    speaker: Participant,
    objective?: string
  ): Promise<TranscriptTurn> {
    const res = await fetch('/api/discussion/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: context.config.topic,
        language: context.config.language,
        phase: context.phase,
        remainingSeconds: 300, // Normalized
        speaker,
        participants: context.participants,
        transcript: context.transcript.slice(-16),
        objective
      }),
      signal: context.abortSignal
    });

    if (!res.ok && res.status !== 200) {
      let errorMsg = `Server error ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error) errorMsg = errJson.error;
      } catch {
        // use default error message
      }
      throw new Error(errorMsg);
    }

    const data = await res.json();

    if (!data.success) {
      if (data.isConfigured === false) {
        const err = new Error(data.error || 'Gemini API key is not configured.');
        (err as Error & { isUnconfigured?: boolean }).isUnconfigured = true;
        throw err;
      }
      throw new Error(data.error || 'Failed to generate discussion turn.');
    }

    return {
      id: createTurnId(),
      speakerId: speaker.id,
      speakerName: speaker.name,
      speakerRole: speaker.role,
      text: data.text,
      relativeTimestampMs: Date.now(),
      source: 'model',
      deliveryState: 'complete',
      isDemoResponse: false,
      replyToSpeakerId: context.transcript[context.transcript.length - 1]?.speakerId,
      addressedParticipantId: data.addressedParticipantId || null,
      stanceUpdate: data.stanceUpdate || undefined
    };
  }

  public async getOpeningTurn(context: DiscussionContext): Promise<TranscriptTurn> {
    return this.callTurnEndpoint(context, MODERATOR, 'open');
  }

  public async getNextTurn(context: DiscussionContext): Promise<TranscriptTurn | null> {
    if (!context.selectedSpeaker) {
      throw new Error('selectedSpeaker must be provided to getNextTurn in GeminiDiscussionProvider');
    }
    return this.callTurnEndpoint(context, context.selectedSpeaker, context.objective);
  }

  public async acknowledgeStudentContribution(
    context: DiscussionContext,
    nextSpeaker: Participant,
    studentTurn: TranscriptTurn
  ): Promise<TranscriptTurn> {
    void studentTurn;
    return this.callTurnEndpoint(
      context,
      nextSpeaker,
      'Directly acknowledge the candidate point and transition into your argument'
    );
  }

  public async getClosingTurn(
    context: DiscussionContext,
    speaker: Participant,
    isStudentInvited: boolean
  ): Promise<TranscriptTurn> {
    const objective =
      speaker.role === 'moderator'
        ? isStudentInvited
          ? 'Invite candidate to provide closing summary first'
          : 'Deliver final structured moderator closing summary grounded in discussion'
        : 'Deliver concise 1-2 sentence concluding stance';

    return this.callTurnEndpoint(context, speaker, objective);
  }
}

export const geminiDiscussionProvider = new GeminiDiscussionProvider();
