import { getOutputTap } from "./audioLevelMeter";

/**
 * High-performance, low-latency streaming PCM Audio Player for Gemini Live Speech-to-Speech.
 * Plays 24kHz 16-bit mono PCM chunks seamlessly using Web Audio API with zero buffering lag.
 * Supports instant hard-stop for barge-in / interruption.
 */

export interface PcmPlayerCallbacks {
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onInterrupted?: (playedDurationMs: number) => void;
  onError?: (err: Error) => void;
}

export class PcmAudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private isPlaying = false;
  private playbackStartTime = 0;
  private totalPlayedSamples = 0;
  private callbacks: PcmPlayerCallbacks = {};
  private completionTimer: NodeJS.Timeout | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      const unlock = () => {
        void this.unlock();
        window.removeEventListener("click", unlock);
        window.removeEventListener("touchstart", unlock);
        window.removeEventListener("keydown", unlock);
      };
      window.addEventListener("click", unlock, { once: true, passive: true });
      window.addEventListener("touchstart", unlock, {
        once: true,
        passive: true,
      });
      window.addEventListener("keydown", unlock, { once: true, passive: true });
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.audioContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx({ sampleRate: 24000 });
      }
    }
    return this.audioContext;
  }

  public async unlock(): Promise<boolean> {
    try {
      const ctx = this.getAudioContext();
      if (ctx?.state === "suspended") {
        await ctx.resume();
      }
      return true;
    } catch {
      return false;
    }
  }

  public setCallbacks(callbacks: PcmPlayerCallbacks) {
    this.callbacks = callbacks;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getPlayedDurationMs(): number {
    if (!this.isPlaying) return 0;
    return Math.max(0, Date.now() - this.playbackStartTime);
  }

  /**
   * Feed a 24kHz 16-bit little-endian mono PCM chunk for immediate playback.
   */
  public feedChunk(pcmData: ArrayBuffer | Uint8Array | string) {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    let arrayBuffer: ArrayBuffer;
    if (typeof pcmData === "string") {
      const binaryString = atob(pcmData);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.codePointAt(i) ?? 0;
      }
      arrayBuffer = bytes.buffer;
    } else if (pcmData instanceof Uint8Array) {
      arrayBuffer = pcmData.buffer.slice(
        pcmData.byteOffset,
        pcmData.byteOffset + pcmData.byteLength,
      ) as ArrayBuffer;
    } else {
      arrayBuffer = pcmData as ArrayBuffer;
    }

    const int16 = new Int16Array(arrayBuffer);
    if (int16.length === 0) return;

    // Convert to Float32 (-1.0 to 1.0)
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(getOutputTap(ctx));

    const now = ctx.currentTime;
    const startTime = Math.max(now, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + audioBuffer.duration;

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.playbackStartTime = Date.now();
      this.callbacks.onPlaybackStart?.();
    }

    this.activeSources.push(source);
    this.totalPlayedSamples += float32.length;

    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) {
        this.activeSources.splice(idx, 1);
      }
    };

    // Reset and schedule end-of-speech detection
    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
    }
    const remainingTimeMs = Math.max(
      100,
      (this.nextPlayTime - now) * 1000 + 150,
    );
    this.completionTimer = setTimeout(() => {
      if (this.isPlaying && this.activeSources.length === 0) {
        this.isPlaying = false;
        this.callbacks.onPlaybackEnd?.();
      }
    }, remainingTimeMs);
  }

  /**
   * Instant hard stop (used when student interrupts or pauses).
   */
  public stop(interrupted = false): number {
    const playedDurationMs = this.isPlaying
      ? Math.max(0, Date.now() - this.playbackStartTime)
      : 0;

    if (this.completionTimer) {
      clearTimeout(this.completionTimer);
      this.completionTimer = null;
    }

    for (const source of this.activeSources) {
      try {
        source.stop(0);
        source.disconnect();
      } catch {
        // Ignore already stopped
      }
    }
    this.activeSources = [];
    this.nextPlayTime = 0;

    if (this.isPlaying) {
      this.isPlaying = false;
      if (interrupted) {
        this.callbacks.onInterrupted?.(playedDurationMs);
      } else {
        this.callbacks.onPlaybackEnd?.();
      }
    }

    return playedDurationMs;
  }
}

export const pcmAudioPlayer = new PcmAudioPlayer();
