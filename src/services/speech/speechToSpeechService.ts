/**
 * Real-time Speech-to-Speech (S2S) voice channel for GD Arena.
 *
 * Connects to the Gemini Live model through the local Voice Gateway and gives
 * every AI panelist (moderator and peers) a live model voice. Each turn is
 * triggered with a text instruction; the model answers with streamed 24kHz PCM
 * audio plus a live transcript for captions and the report.
 *
 * The candidate's microphone is NOT streamed here. Candidate speech is captured
 * push-to-talk style by the speech recognition service, so the live model never
 * answers on its own and the app stays in control of turn-taking.
 */

import { Participant, LanguagePreference } from "@/types/session";
import { pcmAudioPlayer } from "@/services/audio/pcmAudioPlayer";

export interface S2SCallbacks {
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
  /** The live voice model stopped being usable (quota, auth, network). */
  onUnavailable?: (reason: string) => void;
}

export interface S2SOptions {
  topic: string;
  language: LanguagePreference;
  initialSpeaker?: Participant;
}

interface S2SServerMessage {
  type: string;
  audio?: string;
  speakerId?: string;
  speakerName?: string;
  text?: string;
  deliveredText?: string;
  ready?: boolean;
  model?: string;
  voice?: string;
  message?: string;
}

/** How long to wait for the gateway to confirm the live model accepted the session */
const READY_TIMEOUT_MS = 6000;

export class SpeechToSpeechService {
  private ws: WebSocket | null = null;
  private callbacks: S2SCallbacks = {};

  private isConnected = false;
  /** Once the live model fails, stay on the fallback voices for this page session */
  private isUnavailable = false;
  private currentAiSpeakerId: string | null = null;
  private currentAiSpeakerName = "";
  private currentAiDeliveredText = "";
  private aiTurnStartTime = 0;

  public getIsConnected(): boolean {
    return this.isConnected && !this.isUnavailable;
  }

  public getIsAiSpeaking(): boolean {
    return pcmAudioPlayer.getIsPlaying();
  }

  /** Resolves true only once the live model has actually accepted the session. */
  public async start(
    options: S2SOptions,
    callbacks: S2SCallbacks,
  ): Promise<boolean> {
    if (typeof window === "undefined" || this.isUnavailable) return false;

    this.stop();
    this.callbacks = callbacks;

    const isHttps = window.location.protocol === "https:";
    const defaultHost = `${window.location.hostname || "localhost"}:3001`;
    const gatewayHost = process.env.NEXT_PUBLIC_VOICE_GATEWAY_URL || defaultHost;
    const wsProto = isHttps ? "wss:" : "ws:";

    const initialSpeaker = options.initialSpeaker;
    const params = new URLSearchParams({
      topic: options.topic,
      language: options.language,
      speaker_id: initialSpeaker?.id || "mod-1",
      speaker_name: initialSpeaker?.name || "Prof. Sharma",
      speaker_role: initialSpeaker?.role || "moderator",
      voice_name: initialSpeaker?.voice?.geminiVoice || "Charon",
    });

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(readyTimer);
        resolve(ok);
      };
      const readyTimer = setTimeout(() => {
        console.warn("[S2SService] Live voice model did not become ready in time");
        this.stop();
        settle(false);
      }, READY_TIMEOUT_MS);

      let ws: WebSocket;
      try {
        ws = new WebSocket(`${wsProto}//${gatewayHost}/s2s?${params.toString()}`);
      } catch {
        settle(false);
        return;
      }
      this.ws = ws;

      ws.onmessage = (event) => {
        let data: S2SServerMessage;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === "status") {
          if (data.ready) {
            this.isConnected = true;
            settle(true);
          } else {
            this.markUnavailable(data.message || "Live voice model unavailable");
            settle(false);
          }
          return;
        }
        this.handleServerMessage(data);
      };

      ws.onerror = () => {
        console.warn("[S2SService] Voice Gateway connection error");
        settle(false);
      };

      ws.onclose = () => {
        const wasConnected = this.isConnected;
        this.isConnected = false;
        settle(false);
        if (wasConnected && this.ws === ws) {
          this.callbacks.onUnavailable?.("Live voice connection closed");
        }
      };

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
            const speakerId = this.currentAiSpeakerId;
            this.currentAiSpeakerId = null;
            this.callbacks.onAiTurnComplete?.(
              speakerId,
              this.currentAiDeliveredText,
              dur,
            );
          }
        },
        onInterrupted: (playedDurationMs) => {
          if (this.currentAiSpeakerId) {
            const speakerId = this.currentAiSpeakerId;
            this.currentAiSpeakerId = null;
            this.callbacks.onInterrupted?.(
              speakerId,
              this.currentAiDeliveredText,
              playedDurationMs,
            );
          }
        },
      });
    });
  }

  /** Stop using the live model for the rest of this page session. */
  public markUnavailable(reason: string) {
    if (this.isUnavailable) return;
    this.isUnavailable = true;
    this.isConnected = false;
    console.warn("[S2SService] Live voice model unavailable:", reason);
    this.callbacks.onUnavailable?.(reason);
  }

  private handleServerMessage(data: S2SServerMessage) {
    switch (data.type) {
      case "audio_chunk": {
        // Ignore audio that arrives after the turn was interrupted or abandoned
        if (!data.audio || !this.currentAiSpeakerId) return;
        if (!pcmAudioPlayer.getIsPlaying()) {
          this.aiTurnStartTime = Date.now();
        }
        pcmAudioPlayer.feedChunk(data.audio);
        break;
      }

      case "output_transcript": {
        if (data.text && this.currentAiSpeakerId) {
          this.currentAiDeliveredText += data.text;
          this.callbacks.onAiTranscriptPartial?.(
            this.currentAiSpeakerId,
            this.currentAiDeliveredText,
          );
        }
        break;
      }

      case "turn_complete": {
        if (data.deliveredText && this.currentAiSpeakerId) {
          this.currentAiDeliveredText = data.deliveredText;
        }
        break;
      }

      case "error": {
        console.warn("[S2SService] Server error notice:", data.message);
        break;
      }
    }
  }

  /** Ask the live model to speak the next turn in this panelist's voice. */
  public triggerAiTurn(speaker: Participant, instruction?: string) {
    this.currentAiSpeakerId = speaker.id;
    this.currentAiSpeakerName = speaker.name;
    this.currentAiDeliveredText = "";
    this.aiTurnStartTime = Date.now();

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: "trigger_turn",
          speakerId: speaker.id,
          speakerName: speaker.name,
          role: speaker.role,
          personality: speaker.personality,
          voiceName: speaker.voice?.geminiVoice || "Puck",
          instruction,
        }),
      );
    } else {
      this.markUnavailable("Live voice connection is not open");
    }
  }

  /** Abandon a turn that never started speaking (e.g. watchdog timeout). */
  public abandonPendingTurn() {
    this.currentAiSpeakerId = null;
    this.currentAiDeliveredText = "";
    pcmAudioPlayer.stop(false);
  }

  /** Stops the current speaker immediately but keeps the connection open. */
  public interruptCurrentSpeaker(): number {
    const playedMs = pcmAudioPlayer.stop(true);
    this.currentAiSpeakerId = null;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "interrupt" }));
    }
    return playedMs;
  }

  public stop() {
    pcmAudioPlayer.stop(false);

    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      try {
        ws.close();
      } catch {
        // Ignore
      }
    }

    this.isConnected = false;
    this.currentAiSpeakerId = null;
    this.currentAiDeliveredText = "";
  }
}

export const speechToSpeechService = new SpeechToSpeechService();
