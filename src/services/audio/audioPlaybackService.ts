import { getOutputTap } from './audioLevelMeter';
/**
 * Audio playback service for GD Arena AI participants.
 * Handles:
 * - Sarvam AI synthesized audio playback (base64 MP3).
 * - Web Speech API fallback when Sarvam key is unconfigured.
 * - Exact playback duration measurement.
 * - Sentence-level delivery tracking for accurate interruption recovery.
 * - Single-voice serialization (only one participant can speak at a time).
 * - Immediate hard stop on student interruption.
 */

export interface PlaybackCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onInterrupted?: (playedDurationMs: number, deliveredText: string) => void;
  onError?: (err: Error) => void;
  onAudioBlocked?: () => void;
}

export interface PlaybackRequest {
  turnId: string;
  speakerId: string;
  text: string;
  audioBase64?: string;
  voiceId?: string;
  languageCode?: 'en-IN' | 'hi-IN';
  pace?: number;
  pitch?: number;
}

const FEMALE_VOICE_IDS = new Set(['ishita', 'kavya']);
const FEMALE_NAME = /female|woman|samantha|veena|karen|moira|tessa|fiona|victoria|zira|susan|serena|lekha|kanya|heera|neerja|swara|kalpana/i;
const MALE_NAME = /\bmale\b|\bman\b|rishi|daniel|alex|fred|david|mark|george|ravi|hemant|prabhat|aaron|arthur|oliver|thomas/i;

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Pick a stable, persona-specific browser voice so panelists don't all sound alike. */
function pickBrowserVoice(voiceId: string, lang: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const langPrefix = lang.substring(0, 2);
  const inLang = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  const pool = inLang.length > 0 ? inLang : voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  if (pool.length === 0) return voices[0];

  const wantsFemale = FEMALE_VOICE_IDS.has(voiceId);
  const gendered = pool.filter((v) =>
    wantsFemale ? FEMALE_NAME.test(v.name) : MALE_NAME.test(v.name) && !FEMALE_NAME.test(v.name),
  );
  const candidates = gendered.length > 0 ? gendered : pool;
  return candidates[hashString(voiceId) % candidates.length];
}

class AudioPlaybackService {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  private isPlaying = false;
  private currentTurnId: string | null = null;
  private currentSpeakerId: string | null = null;
  private currentText = '';
  private playbackStartTime = 0;
  private callbacks: PlaybackCallbacks | null = null;
  private isUnlocked = false;
  // Chrome's speech synthesis sometimes never fires onend; this guarantees the turn finishes
  private speechWatchdog: ReturnType<typeof setTimeout> | null = null;
  // Scheduled buffers of a streamed (chunked PCM) voice
  private streamSources: AudioBufferSourceNode[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        void this.unlockAudio();
        window.removeEventListener('click', unlock);
        window.removeEventListener('touchstart', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('click', unlock, { once: true, passive: true });
      window.addEventListener('touchstart', unlock, { once: true, passive: true });
      window.addEventListener('keydown', unlock, { once: true, passive: true });
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.audioContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    return this.audioContext;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentSpeakerId(): string | null {
    return this.isPlaying ? this.currentSpeakerId : null;
  }

  public getCurrentTurnId(): string | null {
    return this.isPlaying ? this.currentTurnId : null;
  }

  /**
   * Explicitly unlock audio playback on user interaction (during preflight or click).
   */
  public async unlockAudio(): Promise<boolean> {
    try {
      if (typeof window === 'undefined') return false;
      const ctx = this.getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        await ctx.resume();
      }
      const dummyAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==');
      await dummyAudio.play().catch(() => {});
      this.isUnlocked = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Play a voice that arrives as base64 16-bit mono PCM chunks, starting on the first chunk.
   * Resolves true if any audio played (or the turn was stopped), false if the stream had no audio
   * so the caller can fall back to another voice.
   */
  public async playStream(
    request: PlaybackRequest,
    callbacks: PlaybackCallbacks,
    chunks: AsyncIterable<string>,
    sampleRate: number,
  ): Promise<boolean> {
    this.stop(false);
    const ctx = this.getAudioContext();
    if (!ctx) return false;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});

    this.currentTurnId = request.turnId;
    this.currentSpeakerId = request.speakerId;
    this.currentText = request.text;
    this.callbacks = callbacks;

    const turnId = request.turnId;
    // Small lead so network jitter between chunks never causes audible gaps
    const LEAD_SECONDS = 0.12;
    let nextPlayTime = 0;
    let streamDone = false;
    let gotAudio = false;

    const maybeFinish = () => {
      if (streamDone && this.currentTurnId === turnId && this.streamSources.length === 0 && this.isPlaying) {
        this.finishCleanly();
      }
    };

    try {
      for await (const chunk of chunks) {
        if (this.currentTurnId !== turnId) return true; // stopped or replaced
        const binary = atob(chunk);
        const sampleCount = Math.floor(binary.length / 2);
        if (sampleCount === 0) continue;
        const float32 = new Float32Array(sampleCount);
        for (let i = 0; i < sampleCount; i++) {
          let v = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
          if (v >= 0x8000) v -= 0x10000;
          float32[i] = v / 32768;
        }
        const buffer = ctx.createBuffer(1, sampleCount, sampleRate);
        buffer.getChannelData(0).set(float32);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(getOutputTap(ctx));

        const startAt = Math.max(ctx.currentTime + (gotAudio ? 0 : LEAD_SECONDS), nextPlayTime);
        source.start(startAt);
        nextPlayTime = startAt + buffer.duration;
        this.streamSources.push(source);
        source.onended = () => {
          const idx = this.streamSources.indexOf(source);
          if (idx !== -1) this.streamSources.splice(idx, 1);
          maybeFinish();
        };

        if (!gotAudio) {
          gotAudio = true;
          this.isPlaying = true;
          this.playbackStartTime = Date.now() + LEAD_SECONDS * 1000;
          callbacks.onStart?.();
        }
      }
    } catch (err) {
      if (!gotAudio) {
        if (this.currentTurnId === turnId) this.cleanup();
        throw err;
      }
      // Stream broke mid-way: let what we already have finish playing
    }

    if (!gotAudio) {
      if (this.currentTurnId === turnId) this.cleanup();
      return false;
    }
    streamDone = true;
    maybeFinish();
    return true;
  }

  /**
   * Play an AI response.
   */
  public async play(request: PlaybackRequest, callbacks: PlaybackCallbacks): Promise<void> {
    // Stop any existing playback first
    this.stop(false);

    this.isPlaying = true;
    this.currentTurnId = request.turnId;
    this.currentSpeakerId = request.speakerId;
    this.currentText = request.text;
    this.callbacks = callbacks;
    this.playbackStartTime = Date.now();

    // Strategy A: Web Audio API playback (most reliable, unaffected by async autoplay expiry)
    if (request.audioBase64) {
      try {
        const binaryString = atob(request.audioBase64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const ctx = this.getAudioContext();
        if (ctx) {
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }

          try {
            const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(getOutputTap(ctx));
            this.currentSource = source;

            source.onended = () => {
              if (this.currentTurnId === request.turnId) {
                this.currentSource = null;
                this.finishCleanly();
              }
            };

            this.playbackStartTime = Date.now();
            callbacks.onStart?.();
            source.start(0);
            return;
          } catch (decodeErr) {
            console.warn('[AudioPlayer] Web Audio decode failed, trying HTML5 Audio fallback:', decodeErr);
          }
        }

        // Strategy B: HTML5 Audio fallback
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        this.currentAudioUrl = url;

        const audio = new Audio(url);
        this.currentAudio = audio;

        audio.onplay = () => {
          this.playbackStartTime = Date.now();
          callbacks.onStart?.();
        };

        audio.onended = () => {
          this.finishCleanly();
        };

        audio.onerror = () => {
          console.warn('[AudioPlayer] Audio playback error, falling back to Web Speech if available');
          this.fallbackToWebSpeech(request, callbacks);
        };

        await audio.play().catch((playErr) => {
          if (playErr.name === 'NotAllowedError') {
            callbacks.onAudioBlocked?.();
          }
          this.fallbackToWebSpeech(request, callbacks);
        });
        return;
      } catch (err) {
        console.warn('[AudioPlayer] Failed to decode audio blob:', err);
        this.fallbackToWebSpeech(request, callbacks);
        return;
      }
    }

    // Strategy C: Browser Web Speech API fallback
    this.fallbackToWebSpeech(request, callbacks);
  }

  private fallbackToWebSpeech(request: PlaybackRequest, callbacks: PlaybackCallbacks) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      // Simulate playback duration cleanly for environments without speech
      const words = request.text.split(/\s+/).length;
      const readingDurationMs = Math.max(1500, Math.min(8000, Math.round((words / 2.5) * 1000)));
      callbacks.onStart?.();
      setTimeout(() => {
        if (this.currentTurnId === request.turnId) {
          this.finishCleanly();
        }
      }, readingDurationMs);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(request.text);
    utterance.lang = request.languageCode === 'hi-IN' ? 'hi-IN' : 'en-IN';
    utterance.rate = request.pace || 1.0;
    // Exaggerate the persona's pitch a little so fallback voices stay distinguishable
    utterance.pitch = Math.min(2, Math.max(0, 1 + ((request.pitch ?? 1) - 1) * 3));

    const voice = pickBrowserVoice(request.speakerId, utterance.lang);
    if (voice) utterance.voice = voice;

    const turnId = request.turnId;
    utterance.onstart = () => {
      if (this.currentTurnId !== turnId) return;
      this.playbackStartTime = Date.now();
      callbacks.onStart?.();
    };

    utterance.onend = () => {
      if (this.currentTurnId === turnId) this.finishCleanly();
    };

    utterance.onerror = (e) => {
      // 'canceled' / 'interrupted' are raised by our own stop(); not real failures
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      if (this.currentTurnId === turnId) {
        callbacks.onError?.(new Error(`Web Speech Error: ${e.error}`));
      }
    };

    const words = request.text.split(/\s+/).length;
    const expectedMs = (words / 2.3) * 1000 / (request.pace || 1);
    this.speechWatchdog = setTimeout(() => {
      if (this.currentTurnId === turnId && this.isPlaying) {
        window.speechSynthesis.cancel();
        this.finishCleanly();
      }
    }, expectedMs * 1.6 + 4000);

    window.speechSynthesis.speak(utterance);
  }

  private finishCleanly() {
    this.isPlaying = false;
    const cb = this.callbacks;
    this.cleanup();
    cb?.onEnd?.();
  }

  /**
   * Halts any active audio immediately.
   * If isInterruption is true, triggers onInterrupted with measured duration and estimated delivered text.
   */
  public stop(isInterruption = true): void {
    if (!this.isPlaying) return;

    const playedDurationMs = Math.max(0, Date.now() - this.playbackStartTime);
    const cb = this.callbacks;
    const fullText = this.currentText;

    this.isPlaying = false;

    // Immediately stop any streamed buffers
    for (const source of this.streamSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // Already stopped
      }
    }
    this.streamSources = [];

    // Immediately stop Web Audio buffer source
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch {
        // Ignore stop errors
      }
      this.currentSource = null;
    }

    // Immediately stop HTML5 Audio
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.src = '';
      } catch {
        // Ignore pause errors
      }
      this.currentAudio = null;
    }

    // Immediately cancel Web Speech
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancel errors
      }
    }

    this.cleanup();

    if (isInterruption && cb?.onInterrupted) {
      // Calculate approximately delivered text using sentence segmentation and ratio
      const deliveredText = this.calculateDeliveredText(fullText, playedDurationMs);
      cb.onInterrupted(playedDurationMs, deliveredText);
    }
  }

  /**
   * Sentence-level delivered text calculation.
   * Avoids guessing individual words; segments into full sentences and marks incomplete sentence if interrupted.
   */
  public calculateDeliveredText(fullText: string, playedDurationMs: number): string {
    const sentences = fullText.match(/[^.!?]+[.!?]+|\S+/g) || [fullText];
    const totalWords = fullText.split(/\s+/).length;
    // Assume average pace of ~2.5 words per second (150 wpm)
    const wordsHeard = Math.min(totalWords, Math.max(1, Math.floor((playedDurationMs / 1000) * 2.5)));

    if (wordsHeard >= totalWords * 0.9) {
      return fullText; // Almost complete
    }

    let accumulatedWords = 0;
    const deliveredSentences: string[] = [];

    for (const sentence of sentences) {
      const sentenceWords = sentence.trim().split(/\s+/).length;
      if (accumulatedWords + sentenceWords <= wordsHeard) {
        deliveredSentences.push(sentence.trim());
        accumulatedWords += sentenceWords;
      } else {
        // Partially heard sentence
        const words = sentence.trim().split(/\s+/);
        const partialWordCount = Math.max(1, wordsHeard - accumulatedWords);
        const partialSlice = words.slice(0, partialWordCount).join(' ');
        deliveredSentences.push(`${partialSlice}… [interrupted]`);
        break;
      }
    }

    return deliveredSentences.join(' ') || '[interrupted before delivering response]';
  }

  private cleanup() {
    if (this.speechWatchdog) {
      clearTimeout(this.speechWatchdog);
      this.speechWatchdog = null;
    }
    if (this.currentAudioUrl) {
      try {
        URL.revokeObjectURL(this.currentAudioUrl);
      } catch {
        // Ignore URL revoke error
      }
      this.currentAudioUrl = null;
    }
    this.currentTurnId = null;
    this.currentSpeakerId = null;
    this.currentText = '';
  }
}

export const audioPlaybackService = new AudioPlaybackService();
