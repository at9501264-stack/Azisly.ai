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
            source.connect(ctx.destination);
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

    // Pick appropriate browser voice if available
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const preferred = voices.find((v) => v.lang.startsWith(utterance.lang.substring(0, 2)));
      if (preferred) utterance.voice = preferred;
    }

    utterance.onstart = () => {
      this.playbackStartTime = Date.now();
      callbacks.onStart?.();
    };

    utterance.onend = () => {
      this.finishCleanly();
    };

    utterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        callbacks.onError?.(new Error(`Web Speech Error: ${e.error}`));
      }
    };

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
