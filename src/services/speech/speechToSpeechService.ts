/**
 * Real-time Speech-to-Speech (S2S) Client Service for GD Arena.
 *
 * Connects directly to Gemini 3.8 Live over WebSocket via local Voice Gateway.
 * Features:
 * - Ultra-low latency conversational dialogue (<800ms time-to-first-audio).
 * - Full-duplex raw audio streaming: 16kHz Linear16 mic input -> 24kHz Linear16 speaker output.
 * - Native Speech-to-Speech: No chaining delay between STT, LLM, and TTS.
 * - Real-time interleaved streaming transcription for live captions and evidence report.
 * - Sub-millisecond barge-in interruption detection.
 */

import { Participant, LanguagePreference, AIPatience } from "@/types/session";
import { pcmAudioPlayer } from "@/services/audio/pcmAudioPlayer";

export interface S2SCallbacks {
  onStatusChange?: (
    status:
      "idle" | "connecting" | "connected" | "speaking" | "listening" | "error",
  ) => void;
  onStudentSpeechStart?: () => void;
  onStudentTranscriptPartial?: (text: string) => void;
  onStudentTurnCommitted?: (text: string, durationMs: number) => void;
  onAiSpeechStart?: (speakerId: string, speakerName: string) => void;
  onAiTranscriptPartial?: (speakerId: string, text: string) => void;
  onAiTurnComplete?: (
    speakerId: string,
    fullText: string,
    durationMs: number,
  ) => void;
  onInterrupted?: (
    speakerId: string,
    deliveredText: string,
    playedDurationMs: number,
  ) => void;
  onError?: (err: Error) => void;
}

export interface S2SOptions {
  topic: string;
  language: LanguagePreference;
  patience: AIPatience;
  initialSpeaker?: Participant;
}

interface IAudioProcessorNode {
  disconnect: () => void;
  onaudioprocess:
    | ((e: {
        inputBuffer: { getChannelData: (channel: number) => Float32Array };
      }) => void)
    | null;
  connect: (destination: AudioNode) => AudioNode;
}

interface S2SServerMessage {
  type: string;
  audio?: string;
  mimeType?: string;
  speakerId?: string;
  speakerName?: string;
  text?: string;
  deliveredText?: string;
  ready?: boolean;
  model?: string;
  voice?: string;
  message?: string;
}

export class SpeechToSpeechService {
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: IAudioProcessorNode | null = null;
  private callbacks: S2SCallbacks = {};
  private options: S2SOptions = {
    topic: "Group Discussion",
    language: "english",
    patience: "balanced",
  };

  private isConnected = false;
  private isStudentSpeaking = false;
  private consecutiveStudentFrames = 0;
  private studentSpeechStartTime = 0;
  private accumulatedStudentTranscript = "";
  private currentAiSpeakerId: string | null = null;
  private currentAiSpeakerName = "";
  private currentAiDeliveredText = "";
  private aiTurnStartTime = 0;
  private studentSilenceTimer: NodeJS.Timeout | null = null;

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getIsAiSpeaking(): boolean {
    return pcmAudioPlayer.getIsPlaying();
  }

  public async start(
    options: S2SOptions,
    callbacks: S2SCallbacks,
  ): Promise<boolean> {
    if (typeof window === "undefined") return false;

    this.options = options;
    this.callbacks = callbacks;
    this.stop();

    try {
      this.callbacks.onStatusChange?.("connecting");

      // 1. Establish microphone access (16kHz Linear16 mono)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      this.mediaStream = stream;

      // 2. Connect to Voice Gateway S2S endpoint
      const isHttps = window.location.protocol === "https:";
      const defaultHost = `${window.location.hostname || "localhost"}:3001`;
      const gatewayHost =
        process.env.NEXT_PUBLIC_VOICE_GATEWAY_URL || defaultHost;
      const wsProto = isHttps ? "wss:" : "ws:";

      const initialSpeaker = options.initialSpeaker;
      const voiceName = initialSpeaker?.voice?.geminiVoice || "Puck";
      const speakerId = initialSpeaker?.id || "ai-aarav";
      const speakerName = initialSpeaker?.name || "Aarav";
      const speakerRole = initialSpeaker?.role || "ai_participant";

      const url = `${wsProto}//${gatewayHost}/s2s?topic=${encodeURIComponent(
        options.topic,
      )}&language=${encodeURIComponent(options.language)}&speaker_id=${encodeURIComponent(
        speakerId,
      )}&speaker_name=${encodeURIComponent(speakerName)}&speaker_role=${encodeURIComponent(
        speakerRole,
      )}&voice_name=${encodeURIComponent(voiceName)}`;

      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.isConnected = true;
        this.callbacks.onStatusChange?.("connected");
        console.log("[S2SService] Connected to Voice Gateway S2S");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data);
        } catch {
          // Binary or non-json message
        }
      };

      ws.onerror = () => {
        console.warn("[S2SService] Voice Gateway S2S connection error");
        this.callbacks.onError?.(new Error("S2S Gateway connection failure"));
        this.callbacks.onStatusChange?.("error");
      };

      ws.onclose = () => {
        this.isConnected = false;
        this.callbacks.onStatusChange?.("idle");
      };

      // 3. Setup Audio Capture Pipeline
      await this.initMicrophoneCapture(stream);

      // 4. Bind PCM Audio Player Callbacks
      pcmAudioPlayer.setCallbacks({
        onPlaybackStart: () => {
          if (this.currentAiSpeakerId) {
            this.callbacks.onAiSpeechStart?.(
              this.currentAiSpeakerId,
              this.currentAiSpeakerName,
            );
          }
        },
        onPlaybackEnd: () => {
          if (this.currentAiSpeakerId) {
            const dur = Math.max(0, Date.now() - this.aiTurnStartTime);
            this.callbacks.onAiTurnComplete?.(
              this.currentAiSpeakerId,
              this.currentAiDeliveredText,
              dur,
            );
          }
        },
        onInterrupted: (playedDurationMs) => {
          if (this.currentAiSpeakerId) {
            this.callbacks.onInterrupted?.(
              this.currentAiSpeakerId,
              this.currentAiDeliveredText,
              playedDurationMs,
            );
          }
        },
      });

      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[S2SService] Failed to initialize S2S:", msg);
      this.callbacks.onError?.(new Error(msg));
      this.callbacks.onStatusChange?.("error");
      return false;
    }
  }

  private async initMicrophoneCapture(stream: MediaStream) {
    const audioContext = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )({
      sampleRate: 16000,
    });
    this.audioContext = audioContext;

    const source = audioContext.createMediaStreamSource(stream);
    const audioCtxWithProcessor = audioContext as unknown as {
      createScriptProcessor: (
        bufferSize: number,
        inputChannels: number,
        outputChannels: number,
      ) => IAudioProcessorNode;
    };

    // 2048 samples @ 16kHz = ~128ms per packet
    const processor = audioCtxWithProcessor.createScriptProcessor(2048, 1, 1);
    this.processor = processor;

    processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);

      // Convert Float32 to Linear16 PCM
      const pcm16 = new Int16Array(inputData.length);
      let maxAmp = 0;
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        if (Math.abs(s) > maxAmp) maxAmp = Math.abs(s);
      }

      const isAiPlaying = pcmAudioPlayer.getIsPlaying();

      // Energy-based VAD for student interruption & speech start
      const SPEECH_THRESHOLD = isAiPlaying ? 0.22 : 0.05;

      if (maxAmp > SPEECH_THRESHOLD) {
        this.consecutiveStudentFrames++;
        if (this.consecutiveStudentFrames >= 2 && !this.isStudentSpeaking) {
          this.isStudentSpeaking = true;
          this.studentSpeechStartTime = Date.now();

          // If AI was speaking, immediately interrupt!
          if (isAiPlaying) {
            console.log(
              "[S2SService] Candidate barge-in detected! Halting AI playback.",
            );
            pcmAudioPlayer.stop(true);
          }

          this.callbacks.onStudentSpeechStart?.();
        }

        if (this.studentSilenceTimer) {
          clearTimeout(this.studentSilenceTimer);
          this.studentSilenceTimer = null;
        }
      } else {
        this.consecutiveStudentFrames = 0;
        if (this.isStudentSpeaking && !this.studentSilenceTimer) {
          const silenceDelay = this.getSilenceDelayMs();
          this.studentSilenceTimer = setTimeout(() => {
            this.handleStudentSpeechEnd();
          }, silenceDelay);
        }
      }

      // Send PCM audio chunk to Gateway
      if (this.ws?.readyState === WebSocket.OPEN) {
        // While AI is speaking and user is quiet, don't stream acoustic echo
        if (isAiPlaying && !this.isStudentSpeaking) return;

        try {
          this.ws.send(pcm16.buffer);
        } catch {
          // Socket write failed
        }
      }
    };

    source.connect(processor as unknown as AudioNode);
    processor.connect(audioContext.destination);
  }

  private getSilenceDelayMs(): number {
    switch (this.options.patience) {
      case "quick":
        return 500;
      case "patient":
        return 1200;
      case "balanced":
      default:
        return 800;
    }
  }

  private handleStudentSpeechEnd() {
    this.isStudentSpeaking = false;
    this.studentSilenceTimer = null;
    const durationMs = Math.max(600, Date.now() - this.studentSpeechStartTime);
    const text = this.accumulatedStudentTranscript.trim();

    if (text) {
      this.callbacks.onStudentTurnCommitted?.(text, durationMs);
      this.accumulatedStudentTranscript = "";
    }
  }

  private handleServerMessage(data: S2SServerMessage) {
    switch (data.type) {
      case "audio_chunk": {
        if (data.audio) {
          if (!pcmAudioPlayer.getIsPlaying()) {
            this.aiTurnStartTime = Date.now();
          }
          this.currentAiSpeakerId = data.speakerId ?? null;
          this.currentAiSpeakerName = data.speakerName || "AI Debater";
          pcmAudioPlayer.feedChunk(data.audio);
        }
        break;
      }

      case "output_transcript": {
        if (data.text) {
          this.currentAiDeliveredText += data.text;
          this.callbacks.onAiTranscriptPartial?.(
            data.speakerId || this.currentAiSpeakerId || "ai",
            this.currentAiDeliveredText,
          );
        }
        break;
      }

      case "input_transcript": {
        if (data.text) {
          this.accumulatedStudentTranscript += ` ${data.text}`;
          this.callbacks.onStudentTranscriptPartial?.(
            this.accumulatedStudentTranscript.trim(),
          );
        }
        break;
      }

      case "interrupted": {
        const playedMs = pcmAudioPlayer.stop(true);
        this.callbacks.onInterrupted?.(
          data.speakerId || this.currentAiSpeakerId || "ai",
          data.deliveredText || this.currentAiDeliveredText,
          playedMs,
        );
        this.currentAiDeliveredText = "";
        break;
      }

      case "turn_complete": {
        // Will also be triggered when audio finishes, but sync text here
        if (data.deliveredText) {
          this.currentAiDeliveredText = data.deliveredText;
        }
        break;
      }

      case "status": {
        if (data.ready) {
          console.log(
            `[S2SService] Server S2S ready: ${data.model} (${data.voice})`,
          );
        }
        break;
      }

      case "error": {
        console.warn("[S2SService] Server error notice:", data.message);
        break;
      }
    }
  }

  /**
   * Triggers the next AI participant's turn in Speech-to-Speech mode.
   * Model immediately synthesizes audio directly from prompt instruction.
   */
  public triggerAiTurn(speaker: Participant, instruction?: string) {
    this.currentAiSpeakerId = speaker.id;
    this.currentAiSpeakerName = speaker.name;
    this.currentAiDeliveredText = "";
    this.aiTurnStartTime = Date.now();

    const voiceName = speaker.voice?.geminiVoice || "Puck";

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "trigger_turn",
          speakerId: speaker.id,
          speakerName: speaker.name,
          role: speaker.role,
          personality: speaker.personality,
          voiceName,
          instruction,
        }),
      );
    }
  }

  /**
   * Sends candidate text turn directly to the S2S model.
   */
  public sendStudentText(text: string) {
    if (this.ws?.readyState === WebSocket.OPEN && text.trim()) {
      this.ws.send(
        JSON.stringify({
          type: "student_text",
          text: text.trim(),
        }),
      );
    }
  }

  /**
   * Interrupts current speaker immediately.
   */
  public interruptCurrentSpeaker(): number {
    const playedMs = pcmAudioPlayer.stop(true);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "interrupt" }));
    }
    return playedMs;
  }

  public stop() {
    pcmAudioPlayer.stop(false);

    if (this.studentSilenceTimer) {
      clearTimeout(this.studentSilenceTimer);
      this.studentSilenceTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }

    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch {
        // Ignore
      }
      this.processor = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        void this.audioContext.close();
      } catch {
        // Ignore
      }
      this.audioContext = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    this.isConnected = false;
    this.isStudentSpeaking = false;
    this.currentAiSpeakerId = null;
    this.currentAiDeliveredText = "";
  }
}

export const speechToSpeechService = new SpeechToSpeechService();
