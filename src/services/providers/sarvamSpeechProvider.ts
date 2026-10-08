import { ISpeechSynthesisProvider, SpeechSynthesisOptions, SpeechSynthesisResult } from '@/types/providers';
import { audioPlaybackService } from '@/services/audio/audioPlaybackService';

export class SarvamSpeechProvider implements ISpeechSynthesisProvider {
  public readonly name = 'Sarvam AI Bulbul (v3)';
  public readonly isAvailable = true;

  public async synthesizeSpeech(
    turnId: string,
    text: string,
    options: SpeechSynthesisOptions
  ): Promise<SpeechSynthesisResult | null> {
    try {
      // 1. Request audio synthesis from server-side Sarvam TTS endpoint
      const response = await fetch('/api/speech/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          speaker: options.voiceId || 'ratan',
          languageCode: options.languageCode || 'en-IN',
          pace: options.pace ?? 1.0
        }),
        signal: options.abortSignal
      });

      let audioBase64: string | undefined;
      let durationEstimateMs = 3000;

      if (response.ok) {
        const data = await response.json();
        audioBase64 = data.audioBase64;
        durationEstimateMs = data.durationEstimateMs || 3000;
      } else {
        // Log non-fatal notice (e.g. key missing or offline) and fallback to browser Web Speech
        console.info('[SarvamTTS] Upstream synthesis unavailable, falling back to client speech synthesis');
      }

      // 2. Play using audio playback service (handles both Sarvam base64 and Web Speech fallback)
      await audioPlaybackService.play(
        {
          turnId,
          speakerId: options.voiceId,
          text,
          audioBase64,
          languageCode: options.languageCode,
          pace: options.pace
        },
        {
          onStart: options.onStart,
          onEnd: options.onEnd,
          onInterrupted: options.onInterrupted,
          onError: options.onError,
          onAudioBlocked: options.onAudioBlocked
        }
      );

      return {
        audioBase64,
        durationEstimateMs
      };
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return null;
      }
      console.warn('[SarvamTTS] Synthesize speech error:', err);
      // Fallback directly to client audio playback service
      await audioPlaybackService.play(
        {
          turnId,
          speakerId: options.voiceId,
          text,
          languageCode: options.languageCode,
          pace: options.pace
        },
        {
          onStart: options.onStart,
          onEnd: options.onEnd,
          onInterrupted: options.onInterrupted,
          onError: options.onError
        }
      );
      return null;
    }
  }

  public stop(): void {
    audioPlaybackService.stop(true);
  }
}

export const sarvamSpeechProvider = new SarvamSpeechProvider();
