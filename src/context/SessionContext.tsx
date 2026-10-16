"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  RoomConfig,
  TranscriptTurn,
  SessionState,
  DiscussionPhase,
  AIPatience,
  EngineMode,
  RecordedSessionEvent,
  SessionEventType,
  InteractionMode,
} from "@/types/session";
import { TurnObjective } from "@/types/providers";
import {
  MODERATOR,
  STUDENT_PARTICIPANT,
  getParticipantsForPanel,
} from "@/constants/participants";
import { PRESET_TOPICS } from "@/constants/topics";
import { demoDiscussionProvider } from "@/services/providers/demoDiscussionProvider";
import { geminiDiscussionProvider } from "@/services/providers/geminiDiscussionProvider";
import { sarvamSpeechProvider } from "@/services/providers/sarvamSpeechProvider";
import { speechRecognitionService } from "@/services/speech/speechRecognitionService";
import { speechToSpeechService } from "@/services/speech/speechToSpeechService";
import { audioPlaybackService } from "@/services/audio/audioPlaybackService";
import { pcmAudioPlayer } from "@/services/audio/pcmAudioPlayer";
import {
  selectNextSpeaker,
  shouldOfferStudentOpportunity,
} from "@/lib/speakerSelector";
import {
  saveSessionToStorage,
  loadSessionFromStorage,
  clearSessionFromStorage,
} from "@/lib/storage";
import { SessionReport } from "@/types/report";
import { generateTranscriptFingerprint } from "@/lib/evidenceVerifier";

interface SessionContextType {
  state: SessionState;
  isRestoredSession: boolean;
  startSession: (config: RoomConfig) => void;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => void;
  resetSession: () => void;
  jumpToClosing: () => void;
  submitStudentTurn: (text: string) => void;
  skipStudentClosing: () => void;
  toggleCaptions: () => void;
  switchToDemoMode: () => void;
  retryGeneration: () => void;
  interruptCurrentSpeaker: () => void;
  setMicMuted: (muted: boolean) => void;
  setInteractionMode: (mode: InteractionMode) => void;
  unlockAudio: () => Promise<void>;
  turnCounts: Record<string, number>;
  report: SessionReport | null;
  isGeneratingReport: boolean;
  reportError: string | null;
  isReportStale: boolean;
  generateReport: (forceRegenerate?: boolean) => Promise<void>;
  /** Shown when premium voices are unavailable and a fallback voice is in use */
  voiceNotice: string | null;
}

/**
 * The Gemini Live speech-to-speech channel is opt-in. By default every panelist
 * speaks through the reply model + voice synthesis pipeline, which keeps full
 * discussion context and gives each persona its own voice.
 */
const LIVE_S2S_ENABLED = process.env.NEXT_PUBLIC_ENABLE_LIVE_S2S === "true";
/** Give up on a live-voice turn that hasn't produced audio within this time */
const S2S_FIRST_AUDIO_TIMEOUT_MS = 8000;
const FALLBACK_VOICE_NOTICE =
  "Premium voices are unavailable right now, so the panel is using your browser's voices.";

const DEFAULT_CONFIG: RoomConfig = {
  topic: PRESET_TOPICS[0].title,
  isCustomTopic: false,
  participantCount: 3,
  language: "english",
  durationMinutes: 5,
  patience: "balanced",
  preferredEngine: "ai",
  mode: "voice",
};

function getTurnPauseMs(patience: AIPatience): number {
  if (patience === "quick") return 350;
  if (patience === "patient") return 900;
  return 500;
}

function getStudentOpportunityPauseMs(patience: AIPatience): number {
  if (patience === "quick") return 3000;
  if (patience === "patient") return 5500;
  return 4000;
}

// Voice mode: the candidate can interrupt any time, so hand-offs only need a natural breath
function getVoiceOpportunityPauseMs(patience: AIPatience): number {
  if (patience === "quick") return 900;
  if (patience === "patient") return 2200;
  return 1400;
}

function getStudentPauseMs(patience: AIPatience): number {
  if (patience === "quick") return 200;
  if (patience === "patient") return 500;
  return 300;
}

let eventSeq = 0;

function createSessionEvent(
  type: SessionEventType,
  data?: Record<string, unknown>,
): RecordedSessionEvent {
  eventSeq += 1;
  return {
    id: `ev-${Date.now()}-${eventSeq}`,
    type,
    timestampMs: Date.now(),
    data,
  };
}

function resolveNextPhase(
  currentPhase: DiscussionPhase,
  nextSpeakerRole: string,
  objective?: TurnObjective,
): DiscussionPhase {
  if (currentPhase === "opening" && nextSpeakerRole === "moderator") {
    return "discussion";
  }
  if (objective === "summary" && currentPhase === "closing") {
    return "completed";
  }
  return currentPhase;
}

function resolveInitialEngine(
  preferredEngine?: EngineMode,
  isAiConfigured?: boolean | null,
): EngineMode {
  if (preferredEngine === "demo" || isAiConfigured === false) {
    return "demo";
  }
  return "ai";
}

const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Generation counter to immediately invalidate stale async timeouts
  const generationRef = useRef<number>(1);
  const activeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clockIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightAbortRef = useRef<AbortController | null>(null);
  const studentSpeechStartRef = useRef<number>(0);
  const s2sWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Voice turn whose audio is still loading; dropped from the transcript if never heard
  const pendingTtsTurnRef = useRef<{ id: string; started: boolean } | null>(null);
  // Next panelist's reply, drafted while the current one is still speaking
  const prefetchRef = useRef<{
    genId: number;
    afterTurnId: string;
    speakerId: string;
    objective?: string;
    controller: AbortController;
    promise: Promise<TranscriptTurn>;
  } | null>(null);
  const pendingS2STurnRef = useRef<{
    id: string;
    speaker: typeof MODERATOR;
    startTime: number;
    objective?: TurnObjective;
    genId: number;
  } | null>(null);

  const [state, setState] = useState<SessionState>(() => {
    return {
      phase: "setup",
      isPaused: false,
      activeSpeakerId: null,
      config: DEFAULT_CONFIG,
      participants: [
        STUDENT_PARTICIPANT,
        MODERATOR,
        ...getParticipantsForPanel(DEFAULT_CONFIG.participantCount),
      ],
      transcript: [],
      elapsedSeconds: 0,
      totalDurationSeconds: DEFAULT_CONFIG.durationMinutes * 60,
      generationId: 1,
      isCaptionsVisible: true,
      studentHasSpokenInClosing: false,
      acknowledgedStudentContribution: false,
      engineMode: "ai",
      isGenerating: false,
      generatingSpeakerId: null,
      errorState: null,
      events: [],
      consecutiveAiTurns: 0,
      awaitingStudentOpportunity: false,
      isAiConfigured: null,
      interactionMode: "voice",
      voiceFlowState: "idle",
      liveCaption: "",
      studentSpeakingDurationMs: 0,
      aiSpeakingDurationMs: 0,
      isAudioBlocked: false,
      isMicMuted: false,
    };
  });

  const [isRestoredSession, setIsRestoredSession] = useState(false);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const currentFingerprint = useMemo(
    () => generateTranscriptFingerprint(state.transcript),
    [state.transcript],
  );

  const isReportStale = Boolean(
    report && report.sessionFingerprint !== currentFingerprint,
  );

  const clearAllTimersAndAbort = useCallback(() => {
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    // The session clock is owned by its own effect; turn resets must not stop it
    if (inFlightAbortRef.current) {
      inFlightAbortRef.current.abort();
      inFlightAbortRef.current = null;
    }
    if (s2sWatchdogRef.current) {
      clearTimeout(s2sWatchdogRef.current);
      s2sWatchdogRef.current = null;
    }
    if (prefetchRef.current) {
      prefetchRef.current.controller.abort();
      prefetchRef.current = null;
    }
    sarvamSpeechProvider.stop();
    // Interrupt playback but keep the live voice connection open for later turns
    speechToSpeechService.interruptCurrentSpeaker();
    pcmAudioPlayer.stop(false);
  }, []);

  const bumpGeneration = useCallback(() => {
    generationRef.current += 1;
    clearAllTimersAndAbort();
    return generationRef.current;
  }, [clearAllTimersAndAbort]);

  // Check server configuration for Gemini on mount
  useEffect(() => {
    let isCancelled = false;
    async function checkServerConfig() {
      try {
        const res = await fetch("/api/discussion/config");
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            setState((prev) => ({
              ...prev,
              isAiConfigured: Boolean(data.isConfigured),
              engineMode: data.isConfigured ? "ai" : "demo",
            }));
          }
        }
      } catch {
        if (!isCancelled) {
          setState((prev) => ({
            ...prev,
            isAiConfigured: false,
            engineMode: "demo",
          }));
        }
      }
    }
    void checkServerConfig();
    return () => {
      isCancelled = true;
    };
  }, []);

  // Load recoverable session on initial mount
  useEffect(() => {
    const saved = loadSessionFromStorage();
    if (saved && saved.phase !== "setup") {
      const participants = [
        STUDENT_PARTICIPANT,
        MODERATOR,
        ...getParticipantsForPanel(saved.config.participantCount),
      ];

      setState({
        phase: saved.phase,
        isPaused: true, // Always restore paused
        activeSpeakerId: null,
        config: saved.config,
        participants,
        transcript: saved.transcript,
        elapsedSeconds: saved.elapsedSeconds,
        totalDurationSeconds: saved.totalDurationSeconds,
        generationId: ++generationRef.current,
        isCaptionsVisible: saved.isCaptionsVisible,
        studentHasSpokenInClosing: saved.studentHasSpokenInClosing,
        acknowledgedStudentContribution: false,
        engineMode: saved.engineMode || "demo",
        isGenerating: false,
        generatingSpeakerId: null,
        errorState: null,
        events: saved.events || [createSessionEvent("session_resumed")],
        consecutiveAiTurns: 0,
        awaitingStudentOpportunity: false,
        isAiConfigured: null,
        interactionMode: saved.interactionMode || "voice",
        voiceFlowState: "paused",
        liveCaption: "",
        studentSpeakingDurationMs: saved.studentSpeakingDurationMs || 0,
        aiSpeakingDurationMs: saved.aiSpeakingDurationMs || 0,
        isAudioBlocked: false,
        isMicMuted: false,
      });
      if (saved.report) {
        setReport(saved.report);
      }
      setIsRestoredSession(true);
    }
  }, []);

  // Save state updates to localStorage
  useEffect(() => {
    if (state.phase !== "setup") {
      saveSessionToStorage(state, report);
    }
  }, [state, report]);

  // Clock ticker effect
  useEffect(() => {
    if (
      state.isPaused ||
      state.phase === "setup" ||
      state.phase === "completed" ||
      state.errorState !== null
    ) {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
        clockIntervalRef.current = null;
      }
      return;
    }

    clockIntervalRef.current = setInterval(() => {
      setState((prev) => {
        if (
          prev.isPaused ||
          prev.phase === "setup" ||
          prev.phase === "completed" ||
          prev.errorState !== null
        ) {
          return prev;
        }

        const nextElapsed = prev.elapsedSeconds + 1;

        // Auto trigger closing when approaching the end of time (last 45 seconds)
        if (
          nextElapsed >= prev.totalDurationSeconds - 45 &&
          prev.phase === "discussion"
        ) {
          return {
            ...prev,
            elapsedSeconds: nextElapsed,
            phase: "closing",
            events: [
              ...prev.events,
              createSessionEvent("phase_changed", { phase: "closing" }),
            ],
          };
        }

        if (
          nextElapsed >= prev.totalDurationSeconds &&
          prev.phase === "closing"
        ) {
          return {
            ...prev,
            elapsedSeconds: prev.totalDurationSeconds,
            phase: "completed",
            activeSpeakerId: null,
            voiceFlowState: "completed",
            events: [
              ...prev.events,
              createSessionEvent("phase_changed", { phase: "completed" }),
            ],
          };
        }

        return {
          ...prev,
          elapsedSeconds: nextElapsed,
        };
      });
    }, 1000);

    return () => {
      if (clockIntervalRef.current) {
        clearInterval(clockIntervalRef.current);
        clockIntervalRef.current = null;
      }
    };
  }, [state.isPaused, state.phase, state.errorState]);

  // Active generator function supporting both Gemini and Demo fallback
  const generateTurn = useCallback(
    async (
      speaker: (typeof state)["participants"][0],
      objective: string | undefined,
      current: SessionState,
      abortSignal: AbortSignal,
    ): Promise<TranscriptTurn> => {
      const isDemo = current.engineMode === "demo";

      if (!isDemo) {
        try {
          const result = await geminiDiscussionProvider.getNextTurn({
            config: current.config,
            participants: current.participants,
            transcript: current.transcript,
            activeSpeakerId: speaker.id,
            phase: current.phase,
            selectedSpeaker: speaker,
            objective: objective as TurnObjective | undefined,
            abortSignal,
          });

          if (result) return result;
        } catch (err: unknown) {
          if (abortSignal.aborted) throw err;
          throw err;
        }
      }

      // Demo provider fallback
      if (current.phase === "opening") {
        return demoDiscussionProvider.getOpeningTurn({
          config: current.config,
          participants: current.participants,
          transcript: current.transcript,
          activeSpeakerId: speaker.id,
          phase: "opening",
        });
      }

      if (current.phase === "closing") {
        const isModInviting =
          speaker.role === "moderator" &&
          !current.transcript.some(
            (t) =>
              t.speakerId === MODERATOR.id &&
              t.text.toLowerCase().includes("concluding"),
          );
        return demoDiscussionProvider.getClosingTurn(
          {
            config: current.config,
            participants: current.participants,
            transcript: current.transcript,
            activeSpeakerId: speaker.id,
            phase: "closing",
          },
          speaker,
          isModInviting,
        );
      }

      const lastTurn = current.transcript[current.transcript.length - 1];
      if (
        lastTurn?.speakerRole === "student" &&
        !current.acknowledgedStudentContribution
      ) {
        return demoDiscussionProvider.acknowledgeStudentContribution(
          {
            config: current.config,
            participants: current.participants,
            transcript: current.transcript,
            activeSpeakerId: speaker.id,
            phase: "discussion",
            lastStudentTurn: lastTurn,
          },
          speaker,
          lastTurn,
        );
      }

      const turn = await demoDiscussionProvider.getNextTurn({
        config: current.config,
        participants: current.participants,
        transcript: current.transcript,
        activeSpeakerId: speaker.id,
        phase: "discussion",
      });

      return (
        turn || {
          id: `turn-fallback-${Date.now()}`,
          speakerId: speaker.id,
          speakerName: speaker.name,
          speakerRole: speaker.role,
          text: `Regarding "${current.config.topic}", we must examine both opportunities and trade-offs.`,
          relativeTimestampMs: current.elapsedSeconds * 1000,
          source: "scripted-demo",
          deliveryState: "complete",
          isDemoResponse: true,
        }
      );
    },
    [],
  );

  /**
   * While a panelist speaks, draft the following reply from the discussion as it will
   * stand once they finish. Used only if the same speaker and goal are still chosen.
   */
  const prefetchFollowingTurn = useCallback(
    (genId: number, spokenTurn: TranscriptTurn, objective?: TurnObjective) => {
      const base = stateRef.current;
      if (base.interactionMode !== "voice" || generationRef.current !== genId) return;

      const transcript = [
        ...base.transcript.filter((t) => t.id !== spokenTurn.id),
        {
          ...spokenTurn,
          deliveryState: "complete" as const,
          deliveryStatus: "fully_delivered" as const,
          deliveredText: spokenTurn.text,
        },
      ];
      const phase = resolveNextPhase(base.phase, spokenTurn.speakerRole, objective);
      if (phase === "completed") return;
      // The next step would be a pause for the candidate, not another panelist
      if (shouldOfferStudentOpportunity(base.consecutiveAiTurns, phase)) return;

      let decision;
      try {
        decision = selectNextSpeaker({
          participants: base.participants,
          transcript,
          phase,
          consecutiveAiTurns: base.consecutiveAiTurns,
          remainingSeconds: Math.max(0, base.totalDurationSeconds - base.elapsedSeconds),
        });
      } catch {
        return;
      }

      const controller = new AbortController();
      const promise = generateTurn(
        decision.speaker,
        decision.objective,
        { ...base, transcript, phase },
        controller.signal,
      );
      promise.catch(() => {}); // Failures fall back to a fresh request
      prefetchRef.current = {
        genId,
        afterTurnId: spokenTurn.id,
        speakerId: decision.speaker.id,
        objective: decision.objective,
        controller,
        promise,
      };
    },
    [generateTurn],
  );

  const scheduleNextTurnRef = useRef<(genId: number, delayMs: number) => void>(
    () => {},
  );

  const triggerStudentOpportunityWindow = useCallback(
    (
      genId: number,
      patience: AIPatience,
      scheduleCallback: (g: number, d: number) => void,
      isVoice: boolean,
    ) => {
      setState((prev) => ({
        ...prev,
        awaitingStudentOpportunity: true,
        activeSpeakerId: null,
        voiceFlowState: "listening",
        isGenerating: false,
        generatingSpeakerId: null,
      }));

      const oppPause = isVoice
        ? getVoiceOpportunityPauseMs(patience)
        : getStudentOpportunityPauseMs(patience);
      activeTimerRef.current = setTimeout(() => {
        if (generationRef.current !== genId) return;
        setState((prev) => ({
          ...prev,
          awaitingStudentOpportunity: false,
          consecutiveAiTurns: 0,
        }));
        scheduleCallback(genId, isVoice ? 250 : 1000);
      }, oppPause);
    },
    [],
  );

  const handleGenerationError = useCallback(
    (
      err: unknown,
      genId: number,
      scheduleCallback: (g: number, d: number) => void,
    ) => {
      const isUnconfigured = Boolean(
        err &&
        typeof err === "object" &&
        "isUnconfigured" in err &&
        (err as { isUnconfigured?: boolean }).isUnconfigured,
      );
      const errMsg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Discussion generation error";

      console.warn("[Discussion generation issue]:", errMsg);

      if (isUnconfigured) {
        setState((prev) => ({
          ...prev,
          engineMode: "demo",
          isGenerating: false,
          generatingSpeakerId: null,
          events: [
            ...prev.events,
            createSessionEvent("switched_to_demo", {
              reason: "unconfigured_key",
            }),
          ],
        }));
        scheduleCallback(genId, 500);
        return;
      }

      setState((prev) => ({
        ...prev,
        isGenerating: false,
        generatingSpeakerId: null,
        activeSpeakerId: null,
        voiceFlowState: "error",
        errorState: {
          message: errMsg || "Failed to generate discussion turn.",
          retryable: true,
        },
        events: [
          ...prev.events,
          createSessionEvent("ai_generation_failed", { error: errMsg }),
        ],
      }));
    },
    [],
  );

  /** Ids of panel turns that were generated but never actually heard. */
  const takeUnheardTurnIds = useCallback((): string[] => {
    const pending = pendingTtsTurnRef.current;
    pendingTtsTurnRef.current = null;
    return pending && !pending.started ? [pending.id] : [];
  }, []);

  // Drop a live-voice turn that never started speaking and let the fallback voices take it
  const abandonPendingS2STurn = useCallback(() => {
    if (s2sWatchdogRef.current) {
      clearTimeout(s2sWatchdogRef.current);
      s2sWatchdogRef.current = null;
    }
    const pending = pendingS2STurnRef.current;
    if (!pending) return;
    pendingS2STurnRef.current = null;
    speechToSpeechService.abandonPendingTurn();
    setState((prev) => ({
      ...prev,
      isGenerating: false,
      generatingSpeakerId: null,
      activeSpeakerId: null,
      voiceFlowState: "listening",
      liveCaption: "",
      transcript: prev.transcript.filter((t) => t.id !== pending.id),
    }));
    if (generationRef.current === pending.genId) {
      scheduleNextTurnRef.current(pending.genId, 300);
    }
  }, []);

  // Primary turn execution logic
  const executeNextTurn = useCallback(
    async (genId: number, scheduleCallback: (g: number, d: number) => void) => {
      const current = stateRef.current;
      if (
        current.isPaused ||
        current.phase === "setup" ||
        current.phase === "completed" ||
        current.errorState !== null ||
        current.voiceFlowState === "student_speaking" ||
        // Mic on = the candidate holds the floor; the panel waits
        (current.interactionMode === "voice" && !current.isMicMuted)
      ) {
        return;
      }

      // Check for student entry opportunity window (after at most 2 consecutive AI turns)
      if (
        shouldOfferStudentOpportunity(
          current.consecutiveAiTurns,
          current.phase,
        ) &&
        !current.awaitingStudentOpportunity
      ) {
        triggerStudentOpportunityWindow(
          genId,
          current.config.patience,
          scheduleCallback,
          current.interactionMode === "voice",
        );
        return;
      }

      // Deterministically select next speaker
      const remainingSeconds = Math.max(
        0,
        current.totalDurationSeconds - current.elapsedSeconds,
      );
      let decision;
      try {
        decision = selectNextSpeaker({
          participants: current.participants,
          transcript: current.transcript,
          phase: current.phase,
          consecutiveAiTurns: current.consecutiveAiTurns,
          remainingSeconds,
        });
      } catch (err) {
        console.error("Speaker selection error:", err);
        return;
      }

      const nextSpeaker = decision.speaker;

      // =======================================================================
      // DIRECT SPEECH-TO-SPEECH (S2S) EXECUTION PATH (<800ms Latency)
      // =======================================================================
      const isVoiceMode = current.interactionMode === "voice";
      const isS2SActive =
        LIVE_S2S_ENABLED &&
        isVoiceMode &&
        current.engineMode === "ai" &&
        speechToSpeechService.getIsConnected();

      if (isS2SActive) {
        const pendingTurnId = `turn-${nextSpeaker.id}-${Date.now()}`;
        const speechStartTime = Date.now();

        pendingS2STurnRef.current = {
          id: pendingTurnId,
          speaker: nextSpeaker,
          startTime: speechStartTime,
          objective: decision.objective,
          genId,
        };

        setState((prev) => ({
          ...prev,
          isGenerating: true,
          generatingSpeakerId: nextSpeaker.id,
          activeSpeakerId: null,
          voiceFlowState: "thinking",
          events: [
            ...prev.events,
            createSessionEvent("ai_generation_started", {
              speakerId: nextSpeaker.id,
              engineMode: "s2s",
            }),
          ],
          transcript: [
            ...prev.transcript,
            {
              id: pendingTurnId,
              speakerId: nextSpeaker.id,
              speakerName: nextSpeaker.name,
              speakerRole: nextSpeaker.role,
              text: "",
              relativeTimestampMs: prev.elapsedSeconds * 1000,
              source: "model",
              deliveryState: "in-progress",
              deliveryStatus: "unplayed",
              phase: prev.phase,
            },
          ],
        }));

        const recentRemarks = current.transcript
          .slice(-3)
          .map((t) => `${t.speakerName}: "${t.deliveredText || t.text}"`)
          .join("\n");

        const instruction = `[Turn for ${nextSpeaker.name} (${nextSpeaker.role}, persona: ${nextSpeaker.personality})]:
Topic: "${current.config.topic}".
Objective: ${decision.objective || "Present perspective"}.
Recent remarks in discussion:
${recentRemarks || "None yet; this is the opening of the discussion."}
Deliver a concise, punchy 1-2 sentence response directly addressing recent remarks. Speak immediately.`;

        speechToSpeechService.triggerAiTurn(nextSpeaker, instruction);

        // If no audio arrives in time, stop using the live model and replay this turn on fallback voices
        if (s2sWatchdogRef.current) clearTimeout(s2sWatchdogRef.current);
        s2sWatchdogRef.current = setTimeout(() => {
          s2sWatchdogRef.current = null;
          if (pendingS2STurnRef.current?.id !== pendingTurnId) return;
          if (stateRef.current.activeSpeakerId === nextSpeaker.id) return;
          speechToSpeechService.markUnavailable("No audio from live voice model");
          setVoiceNotice(FALLBACK_VOICE_NOTICE);
          abandonPendingS2STurn();
        }, S2S_FIRST_AUDIO_TIMEOUT_MS);
        return;
      }

      // Fallback: Chained STT / LLM / TTS path
      setState((prev) => ({
        ...prev,
        isGenerating: true,
        generatingSpeakerId: nextSpeaker.id,
        activeSpeakerId: null,
        voiceFlowState: "thinking",
        events: [
          ...prev.events,
          createSessionEvent("ai_generation_started", {
            speakerId: nextSpeaker.id,
            engineMode: prev.engineMode,
          }),
        ],
      }));

      // Reuse the reply drafted during the previous turn when it still fits
      const prefetched = prefetchRef.current;
      prefetchRef.current = null;
      const lastTurn = current.transcript[current.transcript.length - 1];
      const canUsePrefetch =
        prefetched !== null &&
        prefetched.genId === genId &&
        prefetched.speakerId === nextSpeaker.id &&
        prefetched.objective === decision.objective &&
        lastTurn?.id === prefetched.afterTurnId;
      if (prefetched && !canUsePrefetch) prefetched.controller.abort();

      // Setup AbortController for in-flight request
      const abortController = canUsePrefetch ? prefetched.controller : new AbortController();
      inFlightAbortRef.current = abortController;

      let generatedTurn: TranscriptTurn;
      try {
        generatedTurn = canUsePrefetch
          ? await prefetched.promise.catch(() =>
              generateTurn(nextSpeaker, decision.objective, current, abortController.signal),
            )
          : await generateTurn(
              nextSpeaker,
              decision.objective,
              current,
              abortController.signal,
            );
      } catch (err: unknown) {
        if (abortController.signal.aborted || generationRef.current !== genId) {
          // Request was intentionally cancelled (e.g., student spoke or paused)
          return;
        }

        handleGenerationError(err, genId, scheduleCallback);
        return;
      }

      if (generationRef.current !== genId) return;

      // Mark generation complete. In voice mode the speaker only "speaks" once audio starts.
      setState((prev) => ({
        ...prev,
        isGenerating: isVoiceMode,
        generatingSpeakerId: isVoiceMode ? nextSpeaker.id : null,
        activeSpeakerId: isVoiceMode ? null : nextSpeaker.id,
        voiceFlowState: isVoiceMode ? "thinking" : "ai_speaking",
        consecutiveAiTurns:
          nextSpeaker.role === "ai_participant"
            ? prev.consecutiveAiTurns + 1
            : 0,
        events: [
          ...prev.events,
          createSessionEvent("ai_generation_completed", {
            speakerId: nextSpeaker.id,
          }),
        ],
      }));

      // Phase 3 Voice Flow vs Text Flow
      if (isVoiceMode) {
        // Initial in-progress turn appended to transcript
        const pendingTurnId = generatedTurn.id;
        const speechStartTime = Date.now();
        pendingTtsTurnRef.current = { id: pendingTurnId, started: false };

        setState((prev) => ({
          ...prev,
          transcript: [
            ...prev.transcript,
            {
              ...generatedTurn,
              relativeTimestampMs: prev.elapsedSeconds * 1000,
              deliveryState: "in-progress",
              deliveryStatus: "unplayed",
              phase: prev.phase,
            },
          ],
        }));

        const voiceId = nextSpeaker.voice?.sarvamVoice || "ratan";
        const pace = nextSpeaker.voice?.pace ?? 1.0;
        const languageCode =
          current.config.language === "hinglish" ? "hi-IN" : "en-IN";

        setState((prev) => ({
          ...prev,
          events: [
            ...prev.events,
            createSessionEvent("tts_request_start", {
              speakerId: nextSpeaker.id,
              voiceId,
            }),
          ],
        }));

        await sarvamSpeechProvider.synthesizeSpeech(
          pendingTurnId,
          generatedTurn.text,
          {
            voiceId,
            languageCode,
            pace,
            pitch: nextSpeaker.voice?.pitch,
            abortSignal: abortController.signal,
            onUpstreamUnavailable: () => setVoiceNotice(FALLBACK_VOICE_NOTICE),
            onAudioBlocked: () => {
              setState((prev) => ({ ...prev, isAudioBlocked: true }));
            },
            onStart: () => {
              if (generationRef.current !== genId) return;
              if (pendingTtsTurnRef.current?.id === pendingTurnId) {
                pendingTtsTurnRef.current.started = true;
              }
              // Think ahead: draft the next reply while this one is being heard
              prefetchFollowingTurn(genId, generatedTurn, decision.objective);
              setState((prev) => ({
                ...prev,
                isGenerating: false,
                generatingSpeakerId: null,
                activeSpeakerId: nextSpeaker.id,
                voiceFlowState: "ai_speaking",
                // Someone on the panel is talking: the candidate's mic stays off
                isMicMuted: prev.interactionMode === "voice" ? true : prev.isMicMuted,
                events: [
                  ...prev.events,
                  createSessionEvent("tts_playback_start", {
                    speakerId: nextSpeaker.id,
                  }),
                ],
              }));
            },
            onEnd: () => {
              if (generationRef.current !== genId) return;
              if (pendingTtsTurnRef.current?.id === pendingTurnId) pendingTtsTurnRef.current = null;
              const durationMs = Date.now() - speechStartTime;

              setState((prev) => {
                const isPhaseTransition = resolveNextPhase(
                  prev.phase,
                  nextSpeaker.role,
                  decision.objective,
                );

                return {
                  ...prev,
                  activeSpeakerId: null,
                  voiceFlowState: "listening",
                  phase: isPhaseTransition,
                  aiSpeakingDurationMs: prev.aiSpeakingDurationMs + durationMs,
                  transcript: prev.transcript.map((t) =>
                    t.id === pendingTurnId
                      ? {
                          ...t,
                          deliveryState: "complete",
                          deliveryStatus: "fully_delivered",
                          deliveredText: generatedTurn.text,
                          playbackDurationMs: durationMs,
                        }
                      : t,
                  ),
                  events: [
                    ...prev.events,
                    createSessionEvent("tts_playback_complete", {
                      speakerId: nextSpeaker.id,
                      durationMs,
                    }),
                    createSessionEvent("turn_displayed", {
                      turnId: pendingTurnId,
                      speakerId: nextSpeaker.id,
                    }),
                  ],
                };
              });

              // If moderator just finished opening, provide dedicated student opportunity window
              const isModTurn = nextSpeaker.role === "moderator";
              const pauseBetween = isModTurn
                ? getVoiceOpportunityPauseMs(current.config.patience)
                : getTurnPauseMs(current.config.patience);

              if (isModTurn) {
                setState((prev) => ({
                  ...prev,
                  awaitingStudentOpportunity: true,
                }));
              }

              scheduleCallback(genId, pauseBetween);
            },
            onInterrupted: (playedDurationMs, deliveredText) => {
              console.log(
                `[AudioPlayback] Turn ${pendingTurnId} interrupted after ${playedDurationMs}ms`,
              );
              setState((prev) => ({
                ...prev,
                activeSpeakerId: null,
                aiSpeakingDurationMs:
                  prev.aiSpeakingDurationMs + playedDurationMs,
                transcript: prev.transcript.map((t) =>
                  t.id === pendingTurnId
                    ? {
                        ...t,
                        deliveryState: "complete",
                        deliveryStatus: "interrupted",
                        deliveredText,
                        playbackDurationMs: playedDurationMs,
                      }
                    : t,
                ),
                events: [
                  ...prev.events,
                  createSessionEvent("tts_interrupted", {
                    speakerId: nextSpeaker.id,
                    playedDurationMs,
                    deliveredText,
                  }),
                ],
              }));
            },
            onError: (err) => {
              console.warn("[TTS Playback Warning]:", err.message);
              if (pendingTtsTurnRef.current?.id === pendingTurnId) pendingTtsTurnRef.current = null;
              // Complete turn gracefully
              setState((prev) => ({
                ...prev,
                isGenerating: false,
                generatingSpeakerId: null,
                activeSpeakerId: null,
                voiceFlowState: "listening",
              }));
              scheduleCallback(genId, 1200);
            },
          },
        );
      } else {
        // Text mode reading delay
        const readingDurationMs = Math.min(
          4600,
          Math.max(2800, generatedTurn.text.length * 32),
        );

        activeTimerRef.current = setTimeout(() => {
          if (generationRef.current !== genId) return;

          setState((prev) => {
            const isPhaseTransition = resolveNextPhase(
              prev.phase,
              nextSpeaker.role,
              decision.objective,
            );

            return {
              ...prev,
              activeSpeakerId: null,
              phase: isPhaseTransition,
              transcript: [
                ...prev.transcript,
                {
                  ...generatedTurn,
                  relativeTimestampMs: prev.elapsedSeconds * 1000,
                  deliveryState: "complete",
                  deliveryStatus: "fully_delivered",
                  deliveredText: generatedTurn.text,
                  phase: prev.phase,
                },
              ],
              events: [
                ...prev.events,
                createSessionEvent("turn_displayed", {
                  turnId: generatedTurn.id,
                  speakerId: nextSpeaker.id,
                }),
              ],
            };
          });

          const isModTurn = nextSpeaker.role === "moderator";
          const pauseBetween = isModTurn
            ? getStudentOpportunityPauseMs(current.config.patience)
            : getTurnPauseMs(current.config.patience);

          if (isModTurn) {
            setState((prev) => ({
              ...prev,
              awaitingStudentOpportunity: true,
            }));
          }

          scheduleCallback(genId, pauseBetween);
        }, readingDurationMs);
      }
    },
    [
      generateTurn,
      handleGenerationError,
      triggerStudentOpportunityWindow,
      abandonPendingS2STurn,
      prefetchFollowingTurn,
    ],
  );

  // Main turn scheduler with clean cancellation
  const scheduleNextTurn = useCallback(
    (genId: number, delayMs: number) => {
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
        activeTimerRef.current = null;
      }

      activeTimerRef.current = setTimeout(async () => {
        if (generationRef.current !== genId) return;
        const current = stateRef.current;
        if (
          current.isPaused ||
          current.phase === "setup" ||
          current.phase === "completed" ||
          current.errorState !== null
        ) {
          return;
        }

        await executeNextTurn(genId, scheduleNextTurnRef.current);
      }, delayMs);
    },
    [executeNextTurn],
  );

  useEffect(() => {
    scheduleNextTurnRef.current = scheduleNextTurn;
  }, [scheduleNextTurn]);

  // Trigger turn scheduling when phase or pause state changes
  useEffect(() => {
    if (
      state.isPaused ||
      state.phase === "setup" ||
      state.phase === "completed" ||
      state.errorState !== null
    ) {
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
        activeTimerRef.current = null;
      }
      return;
    }

    if (
      state.activeSpeakerId ||
      state.isGenerating ||
      state.voiceFlowState === "student_speaking" ||
      (state.interactionMode === "voice" && !state.isMicMuted)
    ) {
      return;
    }

    // Do NOT overwrite an active timer that was already scheduled (e.g. opportunity pause, reading delay)
    if (activeTimerRef.current) {
      return;
    }

    const currentGen = generationRef.current;
    scheduleNextTurn(currentGen, 1200);
  }, [
    state.isPaused,
    state.phase,
    state.activeSpeakerId,
    state.isGenerating,
    state.voiceFlowState,
    state.errorState,
    state.interactionMode,
    state.isMicMuted,
    scheduleNextTurn,
  ]);

  const submitStudentTurn = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const current = stateRef.current;
      if (current.phase === "setup" || current.phase === "completed") return;

      // Student submission immediately cancels pending AI turn and aborts in-flight audio/generation
      const genId = bumpGeneration();
      sarvamSpeechProvider.stop();
      speechToSpeechService.interruptCurrentSpeaker();
      pcmAudioPlayer.stop(true);
      const unstartedS2STurn = pendingS2STurnRef.current;
      pendingS2STurnRef.current = null;
      const unheardIds = takeUnheardTurnIds();
      if (inFlightAbortRef.current) {
        inFlightAbortRef.current.abort();
      }

      const newTurn: TranscriptTurn = {
        id: `turn-student-${Date.now()}`,
        speakerId: STUDENT_PARTICIPANT.id,
        speakerName: STUDENT_PARTICIPANT.name,
        speakerRole: "student",
        text: trimmed,
        deliveredText: trimmed,
        deliveryStatus: "fully_delivered",
        relativeTimestampMs: current.elapsedSeconds * 1000,
        source: "student",
        deliveryState: "complete",
        // Tag the phase so closing-round contributions are credited in the report
        phase: current.phase === "opening" ? "discussion" : current.phase,
      };

      const isClosingTurn = current.phase === "closing";
      const nextPhase =
        current.phase === "opening" ? "discussion" : current.phase;

      setState((prev) => ({
        ...prev,
        phase: nextPhase,
        activeSpeakerId: STUDENT_PARTICIPANT.id,
        voiceFlowState: "student_speaking",
        isGenerating: false,
        generatingSpeakerId: null,
        errorState: null,
        transcript: [
          ...prev.transcript.filter(
            (t) =>
              !unheardIds.includes(t.id) &&
              !(unstartedS2STurn && t.id === unstartedS2STurn.id && !t.text),
          ),
          newTurn,
        ],
        generationId: genId,
        // Point made: mic goes off so the panel can respond
        isMicMuted: prev.interactionMode === "voice" ? true : prev.isMicMuted,
        studentHasSpokenInClosing: isClosingTurn
          ? true
          : prev.studentHasSpokenInClosing,
        acknowledgedStudentContribution: false,
        consecutiveAiTurns: 0,
        awaitingStudentOpportunity: false,
        liveCaption: "",
        events: [
          ...prev.events,
          createSessionEvent("student_turn_submitted", {
            textLength: trimmed.length,
          }),
        ],
      }));

      // Trigger next AI peer response with natural, low-latency conversational cadence
      const pauseBetween = getStudentPauseMs(current.config.patience);
      activeTimerRef.current = setTimeout(() => {
        if (generationRef.current !== genId) return;

        setState((prev) => ({
          ...prev,
          activeSpeakerId: null,
          voiceFlowState: "thinking",
        }));

        scheduleNextTurn(genId, 50);
      }, pauseBetween);
    },
    [bumpGeneration, scheduleNextTurn, takeUnheardTurnIds],
  );

  // Manual interrupt / Take Floor action
  const interruptCurrentSpeaker = useCallback(() => {
    const genId = bumpGeneration();
    sarvamSpeechProvider.stop();
    speechToSpeechService.interruptCurrentSpeaker();
    pcmAudioPlayer.stop(true);
    if (inFlightAbortRef.current) {
      inFlightAbortRef.current.abort();
    }
    const unstartedS2STurn = pendingS2STurnRef.current;
    pendingS2STurnRef.current = null;
    const unheardIds = takeUnheardTurnIds();
    const isVoice = stateRef.current.interactionMode === "voice";

    setState((prev) => ({
      ...prev,
      phase: prev.phase === "opening" ? "discussion" : prev.phase,
      activeSpeakerId: STUDENT_PARTICIPANT.id,
      voiceFlowState: "student_speaking",
      isGenerating: false,
      generatingSpeakerId: null,
      awaitingStudentOpportunity: false,
      // Interrupting in voice mode opens the candidate's mic
      isMicMuted: isVoice ? false : prev.isMicMuted,
      transcript: prev.transcript.filter(
        (t) =>
          !unheardIds.includes(t.id) &&
          !(unstartedS2STurn && t.id === unstartedS2STurn.id && !t.text),
      ),
      events: [
        ...prev.events,
        createSessionEvent("tts_interrupted", { manual: true }),
      ],
    }));

    // Voice mode: the floor stays with the candidate until they finish or turn the mic off
    if (isVoice) return;

    // Safety timeout: If user clicks interrupt but doesn't speak within 7s, return floor to listening
    if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
    activeTimerRef.current = setTimeout(() => {
      if (generationRef.current !== genId) return;
      setState((prev) => ({
        ...prev,
        activeSpeakerId: null,
        voiceFlowState: "listening",
      }));
      scheduleNextTurnRef.current(genId, 1200);
    }, 7000);
  }, [bumpGeneration, takeUnheardTurnIds]);

  const isLivePhase =
    state.phase === "opening" ||
    state.phase === "discussion" ||
    state.phase === "closing";

  // Live voice channel for the panel (opt-in). Independent of the candidate's mic,
  // so muting or interrupting never tears it down.
  useEffect(() => {
    if (
      !LIVE_S2S_ENABLED ||
      !isLivePhase ||
      state.isPaused ||
      state.interactionMode !== "voice" ||
      state.engineMode !== "ai"
    ) {
      speechToSpeechService.stop();
      return;
    }

    let isSubscribed = true;
    void speechToSpeechService
      .start(
        {
          topic: state.config.topic,
          language: state.config.language,
          initialSpeaker: MODERATOR,
        },
        {
          onAiSpeechStart: (speakerId) => {
            if (!isSubscribed) return;
            const currentRef = pendingS2STurnRef.current;
            if (currentRef && generationRef.current === currentRef.genId) {
              if (s2sWatchdogRef.current) {
                clearTimeout(s2sWatchdogRef.current);
                s2sWatchdogRef.current = null;
              }
              setState((prev) => ({
                ...prev,
                isGenerating: false,
                generatingSpeakerId: null,
                activeSpeakerId: speakerId,
                voiceFlowState: "ai_speaking",
                isMicMuted: true,
                consecutiveAiTurns:
                  currentRef.speaker.role === "ai_participant"
                    ? prev.consecutiveAiTurns + 1
                    : 0,
                events: [
                  ...prev.events,
                  createSessionEvent("ai_generation_completed", { speakerId }),
                  createSessionEvent("tts_playback_start", { speakerId }),
                ],
              }));
            }
          },
          onAiTranscriptPartial: (_speakerId, text) => {
            if (!isSubscribed) return;
            const currentRef = pendingS2STurnRef.current;
            if (currentRef && generationRef.current === currentRef.genId) {
              const turnId = currentRef.id;
              setState((prev) => ({
                ...prev,
                liveCaption: text,
                transcript: prev.transcript.map((t) =>
                  t.id === turnId
                    ? {
                        ...t,
                        text,
                        deliveredText: text,
                        deliveryState: "in-progress",
                      }
                    : t,
                ),
              }));
            }
          },
          onAiTurnComplete: (speakerId, fullText, durationMs) => {
            if (!isSubscribed) return;
            const currentRef = pendingS2STurnRef.current;
            if (!currentRef || generationRef.current !== currentRef.genId)
              return;
            const turnId = currentRef.id;
            const speaker = currentRef.speaker;
            const objective = currentRef.objective;
            const genId = currentRef.genId;
            pendingS2STurnRef.current = null;

            setState((prev) => {
              const isPhaseTransition = resolveNextPhase(
                prev.phase,
                speaker.role,
                objective,
              );
              return {
                ...prev,
                activeSpeakerId: null,
                voiceFlowState: "listening",
                phase: isPhaseTransition,
                liveCaption: "",
                aiSpeakingDurationMs: prev.aiSpeakingDurationMs + durationMs,
                transcript: prev.transcript.map((t) =>
                  t.id === turnId
                    ? {
                        ...t,
                        text: fullText || t.text,
                        deliveredText: fullText || t.deliveredText || t.text,
                        deliveryState: "complete",
                        deliveryStatus: "fully_delivered",
                        playbackDurationMs: durationMs,
                      }
                    : t,
                ),
                events: [
                  ...prev.events,
                  createSessionEvent("tts_playback_complete", {
                    speakerId,
                    durationMs,
                  }),
                  createSessionEvent("turn_displayed", { turnId, speakerId }),
                ],
              };
            });

            const isModTurn = speaker.role === "moderator";
            const pauseBetween = isModTurn
              ? getVoiceOpportunityPauseMs(stateRef.current.config.patience)
              : getTurnPauseMs(stateRef.current.config.patience);

            if (isModTurn) {
              setState((prev) => ({
                ...prev,
                awaitingStudentOpportunity: true,
              }));
            }

            scheduleNextTurnRef.current(genId, pauseBetween);
          },
          onInterrupted: (speakerId, deliveredText, playedDurationMs) => {
            if (!isSubscribed) return;
            const currentRef = pendingS2STurnRef.current;
            if (currentRef) {
              const turnId = currentRef.id;
              pendingS2STurnRef.current = null;
              setState((prev) => ({
                ...prev,
                activeSpeakerId: null,
                liveCaption: "",
                aiSpeakingDurationMs:
                  prev.aiSpeakingDurationMs + playedDurationMs,
                transcript: prev.transcript.map((t) =>
                  t.id === turnId
                    ? {
                        ...t,
                        deliveryState: "complete",
                        deliveryStatus: "interrupted",
                        deliveredText:
                          deliveredText || t.deliveredText || t.text,
                        playbackDurationMs: playedDurationMs,
                      }
                    : t,
                ),
                events: [
                  ...prev.events,
                  createSessionEvent("tts_interrupted", {
                    speakerId,
                    playedDurationMs,
                  }),
                ],
              }));
            }
          },
          onUnavailable: () => {
            if (!isSubscribed) return;
            setVoiceNotice(FALLBACK_VOICE_NOTICE);
            abandonPendingS2STurn();
          },
        },
      )
      .then((ok) => {
        if (isSubscribed && !ok) setVoiceNotice(FALLBACK_VOICE_NOTICE);
      });

    return () => {
      isSubscribed = false;
      speechToSpeechService.stop();
    };
  }, [
    isLivePhase,
    state.isPaused,
    state.interactionMode,
    state.engineMode,
    state.config.topic,
    state.config.language,
    abandonPendingS2STurn,
  ]);

  // Candidate microphone: listens only while the mic is switched on (push to talk)
  useEffect(() => {
    if (
      !isLivePhase ||
      state.isPaused ||
      state.interactionMode !== "voice" ||
      state.isMicMuted ||
      state.errorState !== null
    ) {
      speechRecognitionService.stop();
      return;
    }

    let isSubscribed = true;
    void speechRecognitionService.start(
      {
        onSpeechStart: () => {
          if (!isSubscribed) return;
          studentSpeechStartRef.current = Date.now();
          if (!audioPlaybackService.getIsPlaying()) {
            if (inFlightAbortRef.current) inFlightAbortRef.current.abort();
            setState((prev) => ({
              ...prev,
              activeSpeakerId: STUDENT_PARTICIPANT.id,
              voiceFlowState: "student_speaking",
              events: [
                ...prev.events,
                createSessionEvent("student_speech_start"),
              ],
            }));
          }
        },
        onPartialTranscript: (text) => {
          if (!isSubscribed || audioPlaybackService.getIsPlaying()) return;
          setState((prev) => ({ ...prev, liveCaption: text }));
        },
        onTurnCommitted: (text) => {
          if (!isSubscribed) return;
          const trimmed = text.trim();
          if (!trimmed || trimmed.length < 3) {
            setState((prev) => ({ ...prev, liveCaption: "" }));
            return;
          }
          const speakingDur = Math.max(
            800,
            Date.now() - studentSpeechStartRef.current,
          );
          setState((prev) => ({
            ...prev,
            studentSpeakingDurationMs:
              prev.studentSpeakingDurationMs + speakingDur,
            liveCaption: "",
            events: [
              ...prev.events,
              createSessionEvent("student_speech_end", {
                durationMs: speakingDur,
              }),
            ],
          }));
          submitStudentTurn(trimmed);
        },
        onError: (err) => {
          console.warn("[STT Service Notice]:", err.message);
        },
      },
      {
        patience: state.config.patience,
        language: state.config.language,
        preferGateway: true,
      },
    );

    return () => {
      isSubscribed = false;
      speechRecognitionService.stop();
    };
  }, [
    isLivePhase,
    state.isPaused,
    state.interactionMode,
    state.isMicMuted,
    state.errorState,
    state.config.patience,
    state.config.language,
    submitStudentTurn,
  ]);

  const startSession = useCallback(
    (config: RoomConfig) => {
      const genId = bumpGeneration();
      setIsRestoredSession(false);

      const participants = [
        STUDENT_PARTICIPANT,
        MODERATOR,
        ...getParticipantsForPanel(config.participantCount),
      ];

      const initialEngine: EngineMode = resolveInitialEngine(
        config.preferredEngine,
        stateRef.current.isAiConfigured,
      );

      setState({
        phase: "opening",
        isPaused: false,
        activeSpeakerId: null,
        config,
        participants,
        transcript: [],
        elapsedSeconds: 0,
        totalDurationSeconds: config.durationMinutes * 60,
        generationId: genId,
        isCaptionsVisible: true,
        studentHasSpokenInClosing: false,
        acknowledgedStudentContribution: false,
        engineMode: initialEngine,
        isGenerating: false,
        generatingSpeakerId: null,
        errorState: null,
        events: [
          createSessionEvent("session_started", {
            topic: config.topic,
            engineMode: initialEngine,
            interactionMode: config.mode || "voice",
          }),
        ],
        consecutiveAiTurns: 0,
        awaitingStudentOpportunity: false,
        isAiConfigured: stateRef.current.isAiConfigured,
        interactionMode: config.mode || "voice",
        voiceFlowState: "listening",
        liveCaption: "",
        studentSpeakingDurationMs: 0,
        aiSpeakingDurationMs: 0,
        isAudioBlocked: false,
        // Voice mode starts with the mic off; the candidate turns it on to speak
        isMicMuted: (config.mode || "voice") === "voice",
      });
      setVoiceNotice(null);

      // Schedule opening turn immediately to eliminate awkward startup wait
      scheduleNextTurnRef.current(genId, 200);
    },
    [bumpGeneration],
  );

  const pauseSession = useCallback(() => {
    bumpGeneration();
    const unheardIds = takeUnheardTurnIds();
    speechRecognitionService.stop();
    sarvamSpeechProvider.stop();
    speechToSpeechService.stop();
    pcmAudioPlayer.stop(false);

    setState((prev) => ({
      ...prev,
      isPaused: true,
      activeSpeakerId: null,
      voiceFlowState: "paused",
      isMicMuted: prev.interactionMode === "voice" ? true : prev.isMicMuted,
      isGenerating: false,
      generatingSpeakerId: null,
      transcript: prev.transcript.filter((t) => !unheardIds.includes(t.id)),
      events: [...prev.events, createSessionEvent("session_paused")],
    }));
  }, [bumpGeneration, takeUnheardTurnIds]);

  const resumeSession = useCallback(() => {
    const genId = bumpGeneration();
    setIsRestoredSession(false);
    setState((prev) => ({
      ...prev,
      isPaused: false,
      activeSpeakerId: null,
      voiceFlowState: "listening",
      isGenerating: false,
      generatingSpeakerId: null,
      errorState: null,
      generationId: genId,
      events: [...prev.events, createSessionEvent("session_resumed")],
    }));
  }, [bumpGeneration]);

  const endSession = useCallback(() => {
    bumpGeneration();
    speechRecognitionService.stop();
    sarvamSpeechProvider.stop();
    speechToSpeechService.stop();
    pcmAudioPlayer.stop(false);

    setState((prev) => ({
      ...prev,
      phase: "completed",
      isPaused: true,
      activeSpeakerId: null,
      voiceFlowState: "completed",
      isGenerating: false,
      generatingSpeakerId: null,
      events: [...prev.events, createSessionEvent("session_ended")],
    }));
  }, [bumpGeneration]);

  const resetSession = useCallback(() => {
    bumpGeneration();
    clearSessionFromStorage();
    speechRecognitionService.stop();
    sarvamSpeechProvider.stop();
    speechToSpeechService.stop();
    pcmAudioPlayer.stop(false);
    setIsRestoredSession(false);
    setReport(null);
    setIsGeneratingReport(false);
    setReportError(null);

    setState({
      phase: "setup",
      isPaused: false,
      activeSpeakerId: null,
      config: DEFAULT_CONFIG,
      participants: [
        STUDENT_PARTICIPANT,
        MODERATOR,
        ...getParticipantsForPanel(DEFAULT_CONFIG.participantCount),
      ],
      transcript: [],
      elapsedSeconds: 0,
      totalDurationSeconds: DEFAULT_CONFIG.durationMinutes * 60,
      generationId: 1,
      isCaptionsVisible: true,
      studentHasSpokenInClosing: false,
      acknowledgedStudentContribution: false,
      engineMode: stateRef.current.isAiConfigured ? "ai" : "demo",
      isGenerating: false,
      generatingSpeakerId: null,
      errorState: null,
      events: [createSessionEvent("session_started")],
      consecutiveAiTurns: 0,
      awaitingStudentOpportunity: false,
      isAiConfigured: stateRef.current.isAiConfigured,
      interactionMode: "voice",
      voiceFlowState: "idle",
      liveCaption: "",
      studentSpeakingDurationMs: 0,
      aiSpeakingDurationMs: 0,
      isAudioBlocked: false,
      isMicMuted: false,
    });
  }, [bumpGeneration]);

  const jumpToClosing = useCallback(() => {
    const genId = bumpGeneration();
    sarvamSpeechProvider.stop();
    const unheardIds = takeUnheardTurnIds();

    setState((prev) => ({
      ...prev,
      phase: "closing",
      activeSpeakerId: null,
      voiceFlowState: "listening",
      isGenerating: false,
      generatingSpeakerId: null,
      generationId: genId,
      transcript: prev.transcript.filter((t) => !unheardIds.includes(t.id)),
      elapsedSeconds: Math.max(
        prev.elapsedSeconds,
        prev.totalDurationSeconds - 40,
      ),
      events: [
        ...prev.events,
        createSessionEvent("phase_changed", { phase: "closing" }),
      ],
    }));
  }, [bumpGeneration, takeUnheardTurnIds]);

  const skipStudentClosing = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== "closing") return;

    const genId = bumpGeneration();
    setState((prev) => ({
      ...prev,
      studentHasSpokenInClosing: true,
      activeSpeakerId: null,
      voiceFlowState: "listening",
      isGenerating: false,
      generatingSpeakerId: null,
      generationId: genId,
    }));
    scheduleNextTurn(genId, 600);
  }, [bumpGeneration, scheduleNextTurn]);

  const switchToDemoMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      engineMode: "demo",
      errorState: null,
      isGenerating: false,
      generatingSpeakerId: null,
      events: [
        ...prev.events,
        createSessionEvent("switched_to_demo", { manual: true }),
      ],
    }));
    const genId = bumpGeneration();
    scheduleNextTurn(genId, 800);
  }, [bumpGeneration, scheduleNextTurn]);

  const retryGeneration = useCallback(() => {
    setState((prev) => ({
      ...prev,
      errorState: null,
      isGenerating: false,
      generatingSpeakerId: null,
    }));
    const genId = bumpGeneration();
    scheduleNextTurn(genId, 600);
  }, [bumpGeneration, scheduleNextTurn]);

  const toggleCaptions = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isCaptionsVisible: !prev.isCaptionsVisible,
    }));
  }, []);

  const setMicMuted = useCallback(
    (muted: boolean) => {
      if (!muted) {
        if (stateRef.current.interactionMode === "voice") {
          // Turning the mic on silences whoever is speaking and gives the candidate the floor
          interruptCurrentSpeaker();
        } else {
          setState((prev) => ({ ...prev, isMicMuted: false }));
        }
        return;
      }

      // Turning the mic off sends whatever was said; submitStudentTurn mutes and hands over
      if (speechRecognitionService.forceCommit()) return;

      // Nothing said: release the floor so the panel continues
      setState((prev) => ({
        ...prev,
        isMicMuted: true,
        liveCaption: "",
        ...(prev.activeSpeakerId === STUDENT_PARTICIPANT.id
          ? { activeSpeakerId: null, voiceFlowState: "listening" as const }
          : {}),
      }));
    },
    [interruptCurrentSpeaker],
  );

  const setInteractionMode = useCallback((mode: InteractionMode) => {
    setState((prev) => ({
      ...prev,
      interactionMode: mode,
    }));
  }, []);

  const unlockAudio = useCallback(async () => {
    await audioPlaybackService.unlockAudio();
    await pcmAudioPlayer.unlock();
    setState((prev) => ({
      ...prev,
      isAudioBlocked: false,
    }));
  }, []);

  const turnCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of state.participants) {
      counts[p.id] = 0;
    }
    for (const turn of state.transcript) {
      counts[turn.speakerId] = (counts[turn.speakerId] || 0) + 1;
    }
    return counts;
  }, [state.participants, state.transcript]);

  const generateReport = useCallback(
    async (forceRegenerate: boolean = false) => {
      const currentFp = generateTranscriptFingerprint(state.transcript);
      if (
        !forceRegenerate &&
        report &&
        report.sessionFingerprint === currentFp
      ) {
        return;
      }

      setIsGeneratingReport(true);
      setReportError(null);

      try {
        const response = await fetch("/api/discussion/report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: state.config.topic,
            language: state.config.language,
            transcript: state.transcript,
            timingEvents: [],
            activeDurationMs: state.elapsedSeconds * 1000,
            isVoiceMode: state.interactionMode === "voice",
            isDemoMode: state.engineMode === "demo",
            sessionFingerprint: currentFp,
          }),
        });

        const data = await response.json();
        if (data.success && data.report) {
          setReport(data.report);
          saveSessionToStorage(state, data.report);
        } else {
          setReportError(data.error || "Failed to generate discussion report.");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setReportError(msg || "Network error while generating report.");
      } finally {
        setIsGeneratingReport(false);
      }
    },
    [state, report],
  );

  // Auto-generate report when entering completed phase if missing
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (
      state.phase === "completed" &&
      !report &&
      !isGeneratingReport &&
      !reportError
    ) {
      timer = setTimeout(() => {
        void generateReport();
      }, 50);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [state.phase, report, isGeneratingReport, reportError, generateReport]);

  const contextValue = useMemo<SessionContextType>(
    () => ({
      state,
      isRestoredSession,
      startSession,
      pauseSession,
      resumeSession,
      endSession,
      resetSession,
      jumpToClosing,
      submitStudentTurn,
      skipStudentClosing,
      toggleCaptions,
      switchToDemoMode,
      retryGeneration,
      interruptCurrentSpeaker,
      setMicMuted,
      setInteractionMode,
      unlockAudio,
      turnCounts,
      report,
      isGeneratingReport,
      reportError,
      isReportStale,
      generateReport,
      voiceNotice,
    }),
    [
      state,
      isRestoredSession,
      startSession,
      pauseSession,
      resumeSession,
      endSession,
      resetSession,
      jumpToClosing,
      submitStudentTurn,
      skipStudentClosing,
      toggleCaptions,
      switchToDemoMode,
      retryGeneration,
      interruptCurrentSpeaker,
      setMicMuted,
      setInteractionMode,
      unlockAudio,
      turnCounts,
      report,
      isGeneratingReport,
      reportError,
      isReportStale,
      generateReport,
      voiceNotice,
    ],
  );

  return (
    <SessionContext.Provider value={contextValue}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
