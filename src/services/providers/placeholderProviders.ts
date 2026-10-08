import {
  ITranscriptionProvider,
  ISpeechSynthesisProvider,
  StreamingSTTCallbacks,
  SpeechSynthesisOptions,
  SpeechSynthesisResult
} from '@/types/providers';

/**
 * Placeholder for Streaming Transcription (STT).
 */
export class PlaceholderTranscriptionProvider implements ITranscriptionProvider {
  public readonly name = 'Placeholder Streaming Transcription';
  public readonly isAvailable = false;

  public async startStreaming(
    _callbacks: StreamingSTTCallbacks,
    _options?: { language: 'english' | 'hinglish' }
  ): Promise<void> {
    void _callbacks;
    void _options;
    console.info('[TranscriptionProvider] Using live voice provider in Phase 3.');
  }

  public async stopStreaming(): Promise<void> {
    // No-op
  }
}

/**
 * Placeholder for Speech Synthesis (TTS).
 */
export class PlaceholderSpeechSynthesisProvider implements ISpeechSynthesisProvider {
  public readonly name = 'Placeholder Speech Synthesis';
  public readonly isAvailable = false;

  public async synthesizeSpeech(
    _turnId: string,
    _text: string,
    _options: SpeechSynthesisOptions
  ): Promise<SpeechSynthesisResult | null> {
    void _turnId;
    void _text;
    void _options;
    console.info('[SpeechSynthesisProvider] Using live speech provider in Phase 3.');
    return null;
  }

  public stop(): void {
    // No-op
  }
}

export const placeholderTranscriptionProvider = new PlaceholderTranscriptionProvider();
export const placeholderSpeechSynthesisProvider = new PlaceholderSpeechSynthesisProvider();
