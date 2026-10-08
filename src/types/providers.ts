import { RoomConfig, TranscriptTurn, Participant, DiscussionPhase } from './session';

export type TurnObjective =
  | 'open'
  | 'challenge'
  | 'build'
  | 'clarify'
  | 'redirect'
  | 'synthesize'
  | 'closing'
  | 'summary';

export interface DiscussionContext {
  config: RoomConfig;
  participants: Participant[];
  transcript: TranscriptTurn[];
  activeSpeakerId: string | null;
  phase: DiscussionPhase;
  selectedSpeaker?: Participant;
  lastStudentTurn?: TranscriptTurn;
  objective?: TurnObjective;
  addressedParticipantId?: string | null;
  abortSignal?: AbortSignal;
}

export interface TurnGenerationResult {
  turn: TranscriptTurn;
  addressedParticipantId: string | null;
  stanceUpdate?: string;
}

/**
 * Provider interface for generating turns in the GD arena.
 * In Phase 1: DemoDiscussionProvider.
 * In Phase 2: GeminiDiscussionProvider (LLM via /api/discussion/turn) with fallback to DemoDiscussionProvider.
 */
export interface IDiscussionProvider {
  name: string;
  isDemo: boolean;
  
  getOpeningTurn(context: DiscussionContext): Promise<TranscriptTurn>;
  
  getNextTurn(context: DiscussionContext): Promise<TranscriptTurn | null>;
  
  getClosingTurn(
    context: DiscussionContext,
    speaker: Participant,
    isStudentInvited: boolean
  ): Promise<TranscriptTurn>;
  
  acknowledgeStudentContribution(
    context: DiscussionContext,
    nextSpeaker: Participant,
    studentTurn: TranscriptTurn
  ): Promise<TranscriptTurn>;
}

export interface SpeechSynthesisOptions {
  voiceId: string;
  languageCode: 'en-IN' | 'hi-IN';
  pace?: number;
  abortSignal?: AbortSignal;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: Error) => void;
  onInterrupted?: (playedDurationMs: number, approxDeliveredText: string) => void;
}

export interface SpeechSynthesisResult {
  audioBase64?: string;
  audioUrl?: string;
  durationEstimateMs: number;
  actualDurationMs?: number;
}

/**
 * Speech synthesis provider boundary (Phase 3: Sarvam Bulbul:v3 with Web Speech fallback).
 */
export interface ISpeechSynthesisProvider {
  name: string;
  isAvailable: boolean;
  synthesizeSpeech(
    turnId: string,
    text: string,
    options: SpeechSynthesisOptions
  ): Promise<SpeechSynthesisResult | null>;
  stop(): void;
}

export interface StreamingSTTCallbacks {
  onPartialTranscript: (text: string) => void;
  onFinalSegment: (text: string) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Streaming transcription provider boundary (Phase 3: Sarvam Realtime STT via Voice Gateway / Web Speech API).
 */
export interface ITranscriptionProvider {
  name: string;
  isAvailable: boolean;
  startStreaming(callbacks: StreamingSTTCallbacks, options?: { language: 'english' | 'hinglish' }): Promise<void>;
  stopStreaming(): Promise<void>;
}
