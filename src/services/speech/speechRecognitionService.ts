/**
 * Speech Recognition Service for GD Arena.
 * Handles:
 * - Realtime audio capture from microphone.
 * - Primary transport: Sarvam Voice Gateway (PCM 16kHz mono streaming over WebSocket).
 * - Fallback transport: Web Speech API (webkitSpeechRecognition) for zero-config environments.
 * - VAD / End-of-turn silence detection with Quick (600ms), Balanced (1000ms), Patient (1500ms) targets.
 * - Clear separation between:
 *   1. Partial ephemeral captions (displayed in live caption bar).
 *   2. Finalized segments.
 *   3. Committed student turn (committed once when silence target met).
 */

import { AIPatience } from '@/types/session';
import { audioPlaybackService } from '@/services/audio/audioPlaybackService';

export interface SpeechRecognitionCallbacks {
  onSpeechStart?: () => void;
  onPartialTranscript?: (text: string) => void;
  onTurnCommitted?: (text: string) => void;
  onError?: (err: Error) => void;
  onStatusChange?: (status: 'idle' | 'listening' | 'speaking' | 'reconnecting' | 'error') => void;
}

export interface SpeechRecognitionOptions {
  patience: AIPatience;
  language: 'english' | 'hinglish';
  preferGateway?: boolean;
}

interface IAudioProcessorNode {
  disconnect: () => void;
  onaudioprocess: ((e: { inputBuffer: { getChannelData: (channel: number) => Float32Array } }) => void) | null;
  connect: (destination: AudioNode) => AudioNode;
}

export class SpeechRecognitionService {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: IAudioProcessorNode | null = null;
  private ws: WebSocket | null = null;
  // Browser SpeechRecognition fallback reference
  private browserRecognition: unknown = null;
  private isListening = false;
  private isSpeaking = false;
  private consecutiveSpeechFrames = 0;
  private speechStartTime = 0;
  private accumulatedFinalText = '';
  private currentPartialText = '';
  private silenceTimer: NodeJS.Timeout | null = null;
  private callbacks: SpeechRecognitionCallbacks = {};

  private options: SpeechRecognitionOptions = {
    patience: 'balanced',
    language: 'english',
    preferGateway: true
  };

  /**
   * Known STT hallucination / phantom noise artifacts.
   */
  private static readonly KNOWN_HALLUCINATIONS = new Set([
    'thank you',
    'thank you.',
    'thank you very much',
    'thanks for watching',
    'subtitles by',
    'subtitles',
    'amara.org',
    'subscribe',
    'mbc',
    'you',
    'bye',
    'goodbye',
    'watching',
    '[music]',
    '(music)',
    '[applause]',
    '(applause)'
  ]);


  private getSilenceThresholdMs(): number {
    switch (this.options.patience) {
      case 'quick':
        return 600;
      case 'patient':
        return 1500;
      case 'balanced':
      default:
        return 1000;
    }
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * Start live speech recognition.
   */
  public async start(
    callbacks: SpeechRecognitionCallbacks,
    options: SpeechRecognitionOptions
  ): Promise<boolean> {
    this.callbacks = callbacks;
    this.options = options;
    this.accumulatedFinalText = '';
    this.currentPartialText = '';
    this.isSpeaking = false;

    // Try Gateway if preferred
    if (this.options.preferGateway) {
      const gatewaySuccess = await this.startGatewaySTT();
      if (gatewaySuccess) {
        this.isListening = true;
        this.callbacks.onStatusChange?.('listening');
        return true;
      }
    }

    // Fallback to Web Speech API
    const webSpeechSuccess = this.startWebSpeechSTT();
    if (webSpeechSuccess) {
      this.isListening = true;
      this.callbacks.onStatusChange?.('listening');
      return true;
    }

    this.callbacks.onError?.(
      new Error('Neither Sarvam Voice Gateway nor browser Web Speech API is available.')
    );
    this.callbacks.onStatusChange?.('error');
    return false;
  }

  /**
   * Primary: Connect to local Voice Gateway (which proxies to Sarvam Realtime STT).
   */
  private async startGatewaySTT(): Promise<boolean> {
    if (typeof window === 'undefined') return false;

    try {
      // Determine dynamic gateway endpoints
      const isHttps = window.location.protocol === 'https:';
      const defaultHost = `${window.location.hostname || 'localhost'}:3001`;
      const gatewayHost = process.env.NEXT_PUBLIC_VOICE_GATEWAY_URL || defaultHost;
      const httpProto = isHttps ? 'https:' : 'http:';
      const wsProto = isHttps ? 'wss:' : 'ws:';

      // Check if gateway is reachable
      const healthCheck = await fetch(`${httpProto}//${gatewayHost}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1200)
      }).catch(() => null);

      if (!healthCheck?.ok) {
        return false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000
        }
      });
      this.mediaStream = stream;

      const langCode = this.options.language === 'hinglish' ? 'hi-IN' : 'en-IN';
      const wsUrl = `${wsProto}//${gatewayHost}/stt?language_code=${langCode}&model=saaras:v4`;

      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const transcript = data.transcript || data.text || data.data?.transcript || data.data?.text || '';
          const isFinal = data.type === 'final' || data.event === 'transcript.final' || (data.type === 'data' && !data.is_partial);

          if (transcript) {
            this.handleSpeechChunk(transcript, Boolean(isFinal));
          } else if (data.event === 'speech.start' || data.type === 'speech.start') {
            if (!audioPlaybackService.getIsPlaying()) {
              this.triggerSpeechStart();
            }
          } else if (data.type === 'status' && !data.ready) {
            // Gateway reports Sarvam key not configured; fall back
            this.stopAudioCapture();
            this.startWebSpeechSTT();
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        console.warn('[SpeechService] Voice Gateway WS error. Falling back to Web Speech.');
        this.stopAudioCapture();
        this.startWebSpeechSTT();
      };

      ws.onclose = (ev) => {
        if (this.isListening && ev.code !== 1000) {
          console.warn('[SpeechService] Voice Gateway WS closed unexpectedly. Falling back to Web Speech.');
          this.stopAudioCapture();
          this.startWebSpeechSTT();
        }
      };

      // Set up AudioContext to capture and resample PCM chunks to send upstream
      const audioContext = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate: 16000
      });
      this.audioContext = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      // Use 2048 buffer size (~128ms chunks at 16kHz)
      const audioCtxWithProcessor = audioContext as unknown as {
        createScriptProcessor: (
          bufferSize: number,
          inputChannels: number,
          outputChannels: number
        ) => IAudioProcessorNode;
      };
      const processor = audioCtxWithProcessor.createScriptProcessor(2048, 1, 1);
      this.processor = processor;

      processor.onaudioprocess = (e) => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);

        // Convert Float32 to 16-bit PCM Linear
        const pcm16 = new Int16Array(inputData.length);
        let maxAmp = 0;
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          if (Math.abs(s) > maxAmp) maxAmp = Math.abs(s);
        }

        this.processVadAmplitude(maxAmp);

        // Stream raw binary Linear16 PCM chunk directly over WebSocket
        try {
          this.ws.send(pcm16.buffer);
        } catch {
          // Socket transmission error
        }
      };


      source.connect(processor as unknown as AudioNode);
      processor.connect(audioContext.destination);

      return true;
    } catch (err) {
      console.warn('[SpeechService] Failed to initialize Voice Gateway:', err);
      return false;
    }
  }

  /**
   * Fallback: Browser Web Speech API.
   */
  private startWebSpeechSTT(): boolean {
    if (typeof window === 'undefined') return false;

    type SpeechRecognitionType = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      start: () => void;
      stop: () => void;
      abort: () => void;
      onstart: (() => void) | null;
      onspeechstart: (() => void) | null;
      onresult: ((event: unknown) => void) | null;
      onerror: ((event: unknown) => void) | null;
      onend: (() => void) | null;
    };

    const SpeechRecognitionAPI: SpeechRecognitionType | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionType }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionType }).webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      return false;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = this.options.language === 'hinglish' ? 'hi-IN' : 'en-IN';

      recognition.onstart = () => {
        this.callbacks.onStatusChange?.('listening');
      };

      recognition.onspeechstart = () => {
        // If AI is currently speaking, do not allow raw acoustic trigger to stop AI playback
        if (!audioPlaybackService.getIsPlaying()) {
          this.triggerSpeechStart();
        }
      };

      recognition.onresult = (event: unknown) => {
        const results = (event as {
          results: { [key: number]: { [key: number]: { transcript: string }; isFinal: boolean; length: number }; length: number };
          resultIndex: number;
        }).results;

        let finals = '';
        let interim = '';
        const items = Array.from(results);
        for (const item of items) {
          const phrase = item[0]?.transcript?.trim() || '';
          if (!phrase) continue;
          if (item.isFinal) {
            finals += (finals ? ' ' : '') + phrase;
          } else {
            interim += (interim ? ' ' : '') + phrase;
          }
        }

        this.accumulatedFinalText = finals;
        const currentActiveText = (finals ? `${finals} ${interim}` : interim).trim();
        this.currentPartialText = currentActiveText;

        const cleanChars = currentActiveText.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '');

        if (cleanChars.length >= 2) {
          // If AI is currently speaking, require meaningful text (at least 2 words or >= 5 letters)
          // before triggering barge-in interruption.
          const isAiSpeaking = audioPlaybackService.getIsPlaying();
          if (isAiSpeaking) {
            const words = currentActiveText.split(/\s+/).filter((w) => w.length > 0);
            if (words.length < 2 && cleanChars.length < 5) {
              return;
            }
          }

          this.triggerSpeechStart();
          this.callbacks.onPartialTranscript?.(currentActiveText);
          this.resetSilenceTimer();
        }
      };

      recognition.onerror = (e: unknown) => {
        const errType = (e as { error?: string })?.error;
        if (errType !== 'no-speech') {
          console.warn('[WebSpeech] Recognition error:', errType);
        }
      };

      recognition.onend = () => {
        if (this.isListening) {
          // Restart continuously if still in listening mode
          try {
            recognition.start();
          } catch {
            // Ignore restart error
          }
        }
      };

      recognition.start();
      this.browserRecognition = recognition;
      return true;
    } catch (err) {
      console.warn('[SpeechService] Web Speech API initialization failed:', err);
      return false;
    }
  }

  private handleSpeechChunk(text: string, isFinal: boolean) {
    const trimmed = text.trim();
    if (!trimmed) return;

    // Filter out pure punctuation or noise characters
    const cleanChars = trimmed.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '');
    if (cleanChars.length < 2) return;

    // If AI is speaking, only trigger interruption if real substantive words were transcribed
    const isAiSpeaking = audioPlaybackService.getIsPlaying();
    if (isAiSpeaking) {
      const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
      if (words.length < 2 && cleanChars.length < 5) {
        return;
      }
    }

    this.triggerSpeechStart();

    if (isFinal) {
      this.accumulatedFinalText += (this.accumulatedFinalText ? ' ' : '') + trimmed;
      this.currentPartialText = this.accumulatedFinalText;
      this.callbacks.onPartialTranscript?.(this.accumulatedFinalText);
    } else {
      const livePreview = (this.accumulatedFinalText + ' ' + trimmed).trim();
      this.currentPartialText = livePreview;
      this.callbacks.onPartialTranscript?.(livePreview);
    }

    this.resetSilenceTimer();
  }

  private processVadAmplitude(maxAmp: number) {
    if (audioPlaybackService.getIsPlaying()) {
      this.consecutiveSpeechFrames = 0;
      return;
    }

    if (maxAmp > 0.15) {
      this.consecutiveSpeechFrames++;
      if (this.consecutiveSpeechFrames >= 2 && !this.isSpeaking) {
        this.triggerSpeechStart();
      }
    } else {
      this.consecutiveSpeechFrames = 0;
    }
  }

  private triggerSpeechStart() {
    if (!this.isSpeaking) {
      this.isSpeaking = true;
      this.speechStartTime = Date.now();
      this.callbacks.onSpeechStart?.();
      this.callbacks.onStatusChange?.('speaking');
    }
  }

  private resetSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    const threshold = this.getSilenceThresholdMs();
    this.silenceTimer = setTimeout(() => {
      this.commitTurnIfReady();
    }, threshold);
  }

  /**
   * Evaluates whether a transcript segment is a hallucination or noise artifact.
   */
  private isHallucinationOrNoise(text: string): boolean {
    const trimmed = text.toLowerCase().trim();
    let end = trimmed.length;
    while (end > 0 && '.,!?;:'.includes(trimmed[end - 1])) {
      end--;
    }
    const normalized = trimmed.slice(0, end);

    if (SpeechRecognitionService.KNOWN_HALLUCINATIONS.has(normalized)) {
      return true;
    }

    // Must have at least 3 alphanumeric or Indian language characters
    const cleanChars = text.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, '');
    if (cleanChars.length < 3) {
      return true;
    }

    // If only 1 word, must have at least 4 letters and not be a trivial filler
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    const trivialFillers = new Set(['um', 'uh', 'ah', 'the', 'so', 'a', 'an', 'oh', 'ok', 'okay', 'like', 'haan']);
    if (words.length === 1 && trivialFillers.has(words[0].toLowerCase())) {
      return true;
    }

    return false;
  }

  /**
   * Finalizes the student's turn after sufficient silence.
   */
  private commitTurnIfReady() {
    const textToCommit = (this.accumulatedFinalText || this.currentPartialText).trim();

    if (textToCommit && !this.isHallucinationOrNoise(textToCommit)) {
      this.callbacks.onTurnCommitted?.(textToCommit);
    } else if (textToCommit) {
      console.log(`[SpeechService] Discarded noise/hallucination turn: "${textToCommit}"`);
    }

    // Reset buffer for the next turn
    this.accumulatedFinalText = '';
    this.currentPartialText = '';
    this.isSpeaking = false;
    this.consecutiveSpeechFrames = 0;
    this.callbacks.onPartialTranscript?.('');
    this.callbacks.onStatusChange?.('listening');
  }

  /**
   * Manual commit trigger (e.g. user presses 'Submit Spoken Turn' or enter).
   */
  public forceCommit(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.commitTurnIfReady();
  }

  private stopAudioCapture() {
    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch {
        // Ignore
      }
      this.processor = null;
    }

    if (this.audioContext) {
      void this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }



    if (this.mediaStream) {
      try {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      } catch {
        // Ignore
      }
      this.mediaStream = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
  }

  /**
   * Stops recognition and releases all resources.
   */
  public stop(): void {
    this.isListening = false;
    this.isSpeaking = false;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    this.stopAudioCapture();

    if (this.browserRecognition) {
      try {
        (this.browserRecognition as { stop: () => void; abort: () => void }).abort();
      } catch {
        // Ignore
      }
      this.browserRecognition = null;
    }

    this.callbacks.onStatusChange?.('idle');
  }
}

export const speechRecognitionService = new SpeechRecognitionService();
