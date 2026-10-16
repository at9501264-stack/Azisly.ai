import { ISpeechSynthesisProvider, SpeechSynthesisOptions, SpeechSynthesisResult } from '@/types/providers';
import { audioPlaybackService } from '@/services/audio/audioPlaybackService';

/** Statuses that mean premium synthesis won't recover during this visit (no key, no credit) */
const PERMANENT_FAILURE_STATUSES = new Set([401, 402, 403, 503]);
const STREAM_SAMPLE_RATE = 24000;

/** Yields base64 PCM chunks from the /api/speech/tts-stream SSE body. */
async function* sseAudioChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        let event = 'message';
        let data = '';
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (event === 'complete') return;
        if (event === 'error') throw new Error(`Voice stream error: ${data}`);
        if (event === 'chunk' && data) {
          const parsed = JSON.parse(data) as { audio?: string };
          if (parsed.audio) yield parsed.audio;
        }
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export class SarvamSpeechProvider implements ISpeechSynthesisProvider {
  public readonly name = 'Sarvam AI Bulbul (v3)';
  public readonly isAvailable = true;
  private isUpstreamDown = false;
  private isStreamDown = false;

  public async synthesizeSpeech(
    turnId: string,
    text: string,
    options: SpeechSynthesisOptions
  ): Promise<SpeechSynthesisResult | null> {
    // 1. Lowest latency: stream the voice and start speaking on the first chunk
    if (!this.isStreamDown) {
      try {
        if (await this.playStreamed(turnId, text, options)) return null;
      } catch (err) {
        if (options.abortSignal?.aborted || (err as { name?: string })?.name === 'AbortError') return null;
        console.info('[Voice] Streaming voice unavailable, using full-file synthesis');
      }
    }

    // Skip the slow upstream round-trip once we know it can't succeed
    if (this.isUpstreamDown) {
      await this.playWithBrowserVoice(turnId, text, options);
      return null;
    }

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
        let code: string | undefined;
        try {
          code = (await response.json())?.code;
        } catch {
          // Body not JSON
        }
        if (PERMANENT_FAILURE_STATUSES.has(response.status) || code === 'UPSTREAM_ERROR' || code === 'MISSING_API_KEY') {
          this.isUpstreamDown = true;
          options.onUpstreamUnavailable?.();
        }
      }

      // 2. Play using audio playback service (handles both Sarvam base64 and Web Speech fallback)
      await audioPlaybackService.play(
        {
          turnId,
          speakerId: options.voiceId,
          text,
          audioBase64,
          languageCode: options.languageCode,
          pace: options.pace,
          pitch: options.pitch
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
      await this.playWithBrowserVoice(turnId, text, options);
      return null;
    }
  }

  private async playStreamed(turnId: string, text: string, options: SpeechSynthesisOptions): Promise<boolean> {
    const response = await fetch('/api/speech/tts-stream', {
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

    if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
      if (PERMANENT_FAILURE_STATUSES.has(response.status)) this.isStreamDown = true;
      return false;
    }

    return audioPlaybackService.playStream(
      { turnId, speakerId: options.voiceId, text, languageCode: options.languageCode, pace: options.pace, pitch: options.pitch },
      {
        onStart: options.onStart,
        onEnd: options.onEnd,
        onInterrupted: options.onInterrupted,
        onError: options.onError,
        onAudioBlocked: options.onAudioBlocked
      },
      sseAudioChunks(response.body),
      STREAM_SAMPLE_RATE
    );
  }

  private async playWithBrowserVoice(turnId: string, text: string, options: SpeechSynthesisOptions) {
    await audioPlaybackService.play(
      {
        turnId,
        speakerId: options.voiceId,
        text,
        languageCode: options.languageCode,
        pace: options.pace,
        pitch: options.pitch
      },
      {
        onStart: options.onStart,
        onEnd: options.onEnd,
        onInterrupted: options.onInterrupted,
        onError: options.onError,
        onAudioBlocked: options.onAudioBlocked
      }
    );
  }

  public stop(): void {
    audioPlaybackService.stop(true);
  }
}

export const sarvamSpeechProvider = new SarvamSpeechProvider();
