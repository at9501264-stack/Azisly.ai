'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo
} from 'react';
import {
  RoomConfig,
  TranscriptTurn,
  SessionState,
  DiscussionPhase,
  AIPatience,
  EngineMode,
  RecordedSessionEvent,
  SessionEventType,
  InteractionMode
} from '@/types/session';
import { TurnObjective } from '@/types/providers';
import {
  MODERATOR,
  STUDENT_PARTICIPANT,
  getParticipantsForPanel
} from '@/constants/participants';
import { PRESET_TOPICS } from '@/constants/topics';
import { demoDiscussionProvider } from '@/services/providers/demoDiscussionProvider';
import { geminiDiscussionProvider } from '@/services/providers/geminiDiscussionProvider';
import { sarvamSpeechProvider } from '@/services/providers/sarvamSpeechProvider';
import { speechRecognitionService } from '@/services/speech/speechRecognitionService';
import { audioPlaybackService } from '@/services/audio/audioPlaybackService';
import { selectNextSpeaker, shouldOfferStudentOpportunity } from '@/lib/speakerSelector';
import {
  saveSessionToStorage,
  loadSessionFromStorage,
  clearSessionFromStorage
} from '@/lib/storage';
import { SessionReport } from '@/types/report';
import { generateTranscriptFingerprint } from '@/lib/evidenceVerifier';

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
}

const DEFAULT_CONFIG: RoomConfig = {
  topic: PRESET_TOPICS[0].title,
  isCustomTopic: false,
  participantCount: 3,
  language: 'english',
  durationMinutes: 5,
  patience: 'balanced',
  preferredEngine: 'ai',
  mode: 'voice'
};

function getTurnPauseMs(patience: AIPatience): number {
  if (patience === 'quick') return 1800;
  if (patience === 'patient') return 4000;
  return 2800;
}

function getStudentOpportunityPauseMs(patience: AIPatience): number {
  if (patience === 'quick') return 3600;
  if (patience === 'patient') return 6500;
  return 4800;
}

function getStudentPauseMs(patience: AIPatience): number {
  if (patience === 'quick') return 1600;
  if (patience === 'patient') return 3400;
  return 2400;
}

let eventSeq = 0;

function createSessionEvent(
  type: SessionEventType,
  data?: Record<string, unknown>
): RecordedSessionEvent {
  eventSeq += 1;
  return {
    id: `ev-${Date.now()}-${eventSeq}`,
    type,
    timestampMs: Date.now(),
    data
  };
}

function resolveNextPhase(
  currentPhase: DiscussionPhase,
  nextSpeakerRole: string,
  objective?: TurnObjective
): DiscussionPhase {
  if (currentPhase === 'opening' && nextSpeakerRole === 'moderator') {
    return 'discussion';
  }
  if (objective === 'summary' && currentPhase === 'closing') {
    return 'completed';
  }
  return currentPhase;
}

function resolveInitialEngine(
  preferredEngine?: EngineMode,
  isAiConfigured?: boolean | null
): EngineMode {
  if (preferredEngine === 'demo' || isAiConfigured === false) {
    return 'demo';
  }
  return 'ai';
}

const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Generation counter to immediately invalidate stale async timeouts
  const generationRef = useRef<number>(1);
  const activeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const clockIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightAbortRef = useRef<AbortController | null>(null);
  const studentSpeechStartRef = useRef<number>(0);

  const [state, setState] = useState<SessionState>(() => {
    return {
      phase: 'setup',
      isPaused: false,
      activeSpeakerId: null,
      config: DEFAULT_CONFIG,
      participants: [
        STUDENT_PARTICIPANT,
        MODERATOR,
        ...getParticipantsForPanel(DEFAULT_CONFIG.participantCount)
      ],
      transcript: [],
      elapsedSeconds: 0,
      totalDurationSeconds: DEFAULT_CONFIG.durationMinutes * 60,
      generationId: 1,
      isCaptionsVisible: true,
      studentHasSpokenInClosing: false,
      acknowledgedStudentContribution: false,
      engineMode: 'ai',
      isGenerating: false,
      generatingSpeakerId: null,
      errorState: null,
      events: [],
      consecutiveAiTurns: 0,
      awaitingStudentOpportunity: false,
      isAiConfigured: null,
      interactionMode: 'voice',
      voiceFlowState: 'idle',
      liveCaption: '',
      studentSpeakingDurationMs: 0,
      aiSpeakingDurationMs: 0,
      isAudioBlocked: false,
      isMicMuted: false
    };
  });

  const [isRestoredSession, setIsRestoredSession] = useState(false);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const currentFingerprint = useMemo(
    () => generateTranscriptFingerprint(state.transcript),
    [state.transcript]
  );

  const isReportStale = Boolean(
    report && report.sessionFingerprint !== currentFingerprint
  );

  const clearAllTimersAndAbort = useCallback(() => {
    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    if (clockIntervalRef.current) {
      clearInterval(clockIntervalRef.current);
      clockIntervalRef.current = null;
    }
    if (inFlightAbortRef.current) {
      inFlightAbortRef.current.abort();
      inFlightAbortRef.current = null;
    }
    sarvamSpeechProvider.stop();
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
        const res = await fetch('/api/discussion/config');
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            setState((prev) => ({
              ...prev,
              isAiConfigured: Boolean(data.isConfigured),
              engineMode: data.isConfigured ? 'ai' : 'demo'
            }));
          }
        }
      } catch {
        if (!isCancelled) {
          setState((prev) => ({
            ...prev,
            isAiConfigured: false,
            engineMode: 'demo'
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
    if (saved && saved.phase !== 'setup') {
      const participants = [
        STUDENT_PARTICIPANT,
        MODERATOR,
        ...getParticipantsForPanel(saved.config.participantCount)
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
        engineMode: saved.engineMode || 'demo',
        isGenerating: false,
        generatingSpeakerId: null,
        errorState: null,
        events: saved.events || [createSessionEvent('session_resumed')],
        consecutiveAiTurns: 0,
        awaitingStudentOpportunity: false,
        isAiConfigured: null,
        interactionMode: saved.interactionMode || 'voice',
        voiceFlowState: 'paused',
        liveCaption: '',
        studentSpeakingDurationMs: saved.studentSpeakingDurationMs || 0,
        aiSpeakingDurationMs: saved.aiSpeakingDurationMs || 0,
        isAudioBlocked: false,
        isMicMuted: false
      });
      if (saved.report) {
        setReport(saved.report);
      }
      setIsRestoredSession(true);
    }
  }, []);

  // Save state updates to localStorage
  useEffect(() => {
    if (state.phase !== 'setup') {
      saveSessionToStorage(state, report);
    }
  }, [state, report]);

  // Clock ticker effect
  useEffect(() => {
    if (
      state.isPaused ||
      state.phase === 'setup' ||
      state.phase === 'completed' ||
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
          prev.phase === 'setup' ||
          prev.phase === 'completed' ||
          prev.errorState !== null
        ) {
          return prev;
        }

        const nextElapsed = prev.elapsedSeconds + 1;

        // Auto trigger closing when approaching the end of time (last 45 seconds)
        if (
          nextElapsed >= prev.totalDurationSeconds - 45 &&
          prev.phase === 'discussion'
        ) {
          return {
            ...prev,
            elapsedSeconds: nextElapsed,
            phase: 'closing',
            events: [...prev.events, createSessionEvent('phase_changed', { phase: 'closing' })]
          };
        }

        if (nextElapsed >= prev.totalDurationSeconds && prev.phase === 'closing') {
          return {
            ...prev,
            elapsedSeconds: prev.totalDurationSeconds,
            phase: 'completed',
            activeSpeakerId: null,
            voiceFlowState: 'completed',
            events: [...prev.events, createSessionEvent('phase_changed', { phase: 'completed' })]
          };
        }

        return {
          ...prev,
          elapsedSeconds: nextElapsed
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
      speaker: (typeof state)['participants'][0],
      objective: string | undefined,
      current: SessionState,
      abortSignal: AbortSignal
    ): Promise<TranscriptTurn> => {
      const isDemo = current.engineMode === 'demo';

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
            abortSignal
          });

          if (result) return result;
        } catch (err: unknown) {
          if (abortSignal.aborted) throw err;
          throw err;
        }
      }

      // Demo provider fallback
      if (current.phase === 'opening') {
        return demoDiscussionProvider.getOpeningTurn({
          config: current.config,
          participants: current.participants,
          transcript: current.transcript,
          activeSpeakerId: speaker.id,
          phase: 'opening'
        });
      }

      if (current.phase === 'closing') {
        const isModInviting =
          speaker.role === 'moderator' &&
          !current.transcript.some(
            (t) => t.speakerId === MODERATOR.id && t.text.toLowerCase().includes('concluding')
          );
        return demoDiscussionProvider.getClosingTurn(
          {
            config: current.config,
            participants: current.participants,
            transcript: current.transcript,
            activeSpeakerId: speaker.id,
            phase: 'closing'
          },
          speaker,
          isModInviting
        );
      }

      const lastTurn = current.transcript[current.transcript.length - 1];
      if (lastTurn?.speakerRole === 'student' && !current.acknowledgedStudentContribution) {
        return demoDiscussionProvider.acknowledgeStudentContribution(
          {
            config: current.config,
            participants: current.participants,
            transcript: current.transcript,
            activeSpeakerId: speaker.id,
            phase: 'discussion',
            lastStudentTurn: lastTurn
          },
          speaker,
          lastTurn
        );
      }

      const turn = await demoDiscussionProvider.getNextTurn({
        config: current.config,
        participants: current.participants,
        transcript: current.transcript,
        activeSpeakerId: speaker.id,
        phase: 'discussion'
      });

      return (
        turn || {
          id: `turn-fallback-${Date.now()}`,
          speakerId: speaker.id,
          speakerName: speaker.name,
          speakerRole: speaker.role,
          text: `Regarding "${current.config.topic}", we must examine both opportunities and trade-offs.`,
          relativeTimestampMs: current.elapsedSeconds * 1000,
          source: 'scripted-demo',
          deliveryState: 'complete',
          isDemoResponse: true
        }
      );
    },
    []
  );

  const scheduleNextTurnRef = useRef<(genId: number, delayMs: number) => void>(() => {});

  // Primary turn execution logic
  const executeNextTurn = useCallback(
    async (genId: number, scheduleCallback: (g: number, d: number) => void) => {
      const current = stateRef.current;
      if (
        current.isPaused ||
        current.phase === 'setup' ||
        current.phase === 'completed' ||
        current.errorState !== null ||
        current.voiceFlowState === 'student_speaking'
      ) {
        return;
      }

      // Check for student entry opportunity window (after at most 2 consecutive AI turns)
      if (
        shouldOfferStudentOpportunity(current.consecutiveAiTurns, current.phase) &&
        !current.awaitingStudentOpportunity
      ) {
        setState((prev) => ({
          ...prev,
          awaitingStudentOpportunity: true,
          activeSpeakerId: null,
          voiceFlowState: 'listening',
          isGenerating: false,
          generatingSpeakerId: null
        }));

        // Give student a longer pause to jump in
        const oppPause = getStudentOpportunityPauseMs(current.config.patience);
        activeTimerRef.current = setTimeout(() => {
          if (generationRef.current !== genId) return;
          setState((prev) => ({
            ...prev,
            awaitingStudentOpportunity: false,
            consecutiveAiTurns: 0 // Reset counter after student window expires
          }));
          scheduleCallback(genId, 1000);
        }, oppPause);
        return;
      }

      // Deterministically select next speaker
      const remainingSeconds = Math.max(0, current.totalDurationSeconds - current.elapsedSeconds);
      let decision;
      try {
        decision = selectNextSpeaker({
          participants: current.participants,
          transcript: current.transcript,
          phase: current.phase,
          consecutiveAiTurns: current.consecutiveAiTurns,
          remainingSeconds
        });
      } catch (err) {
        console.error('Speaker selection error:', err);
        return;
      }

      const nextSpeaker = decision.speaker;

      // Enter thinking / generating state
      setState((prev) => ({
        ...prev,
        isGenerating: true,
        generatingSpeakerId: nextSpeaker.id,
        activeSpeakerId: null,
        voiceFlowState: 'thinking',
        events: [
          ...prev.events,
          createSessionEvent('ai_generation_started', {
            speakerId: nextSpeaker.id,
            engineMode: prev.engineMode
          })
        ]
      }));

      // Setup AbortController for in-flight request
      const abortController = new AbortController();
      inFlightAbortRef.current = abortController;

      let generatedTurn: TranscriptTurn;
      try {
        generatedTurn = await generateTurn(
          nextSpeaker,
          decision.objective,
          current,
          abortController.signal
        );
      } catch (err: unknown) {
        if (abortController.signal.aborted || generationRef.current !== genId) {
          // Request was intentionally cancelled (e.g., student spoke or paused)
          return;
        }

        const isUnconfigured = Boolean(
          err && typeof err === 'object' && 'isUnconfigured' in err && (err as { isUnconfigured?: boolean }).isUnconfigured
        );
        const errMsg = err instanceof Error ? err.message : String(err);

        console.warn('[Discussion generation issue]:', errMsg);

        if (isUnconfigured) {
          // Missing API key -> seamlessly switch to demo without infinite error loop
          setState((prev) => ({
            ...prev,
            engineMode: 'demo',
            isGenerating: false,
            generatingSpeakerId: null,
            events: [
              ...prev.events,
              createSessionEvent('switched_to_demo', { reason: 'unconfigured_key' })
            ]
          }));
          // Retry immediately in demo mode
          scheduleCallback(genId, 500);
          return;
        }

        // Real API failure -> display actionable error card and pause progression
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          generatingSpeakerId: null,
          activeSpeakerId: null,
          voiceFlowState: 'error',
          errorState: {
            message: errMsg || 'Failed to generate discussion turn.',
            retryable: true
          },
          events: [
            ...prev.events,
            createSessionEvent('ai_generation_failed', { error: errMsg })
          ]
        }));
        return;
      }

      if (generationRef.current !== genId) return;

      const isVoiceMode = current.interactionMode === 'voice';

      // Mark generation complete
      setState((prev) => ({
        ...prev,
        isGenerating: false,
        generatingSpeakerId: null,
        activeSpeakerId: nextSpeaker.id,
        voiceFlowState: 'ai_speaking',
        consecutiveAiTurns:
          nextSpeaker.role === 'ai_participant' ? prev.consecutiveAiTurns + 1 : 0,
        events: [
          ...prev.events,
          createSessionEvent('ai_generation_completed', { speakerId: nextSpeaker.id })
        ]
      }));

      // Phase 3 Voice Flow vs Text Flow
      if (isVoiceMode) {
        // Initial in-progress turn appended to transcript
        const pendingTurnId = generatedTurn.id;
        const speechStartTime = Date.now();

        setState((prev) => ({
          ...prev,
          transcript: [
            ...prev.transcript,
            {
              ...generatedTurn,
              relativeTimestampMs: prev.elapsedSeconds * 1000,
              deliveryState: 'in-progress',
              deliveryStatus: 'unplayed'
            }
          ]
        }));

        const voiceId = nextSpeaker.voice?.sarvamVoice || 'ratan';
        const pace = nextSpeaker.voice?.pace ?? 1.0;
        const languageCode = current.config.language === 'hinglish' ? 'hi-IN' : 'en-IN';

        setState((prev) => ({
          ...prev,
          events: [...prev.events, createSessionEvent('tts_request_start', { speakerId: nextSpeaker.id, voiceId })]
        }));

        await sarvamSpeechProvider.synthesizeSpeech(pendingTurnId, generatedTurn.text, {
          voiceId,
          languageCode,
          pace,
          abortSignal: abortController.signal,
          onStart: () => {
            if (generationRef.current !== genId) return;
            setState((prev) => ({
              ...prev,
              activeSpeakerId: nextSpeaker.id,
              voiceFlowState: 'ai_speaking',
              events: [...prev.events, createSessionEvent('tts_playback_start', { speakerId: nextSpeaker.id })]
            }));
          },
          onEnd: () => {
            if (generationRef.current !== genId) return;
            const durationMs = Date.now() - speechStartTime;

            setState((prev) => {
              const isPhaseTransition = resolveNextPhase(
                prev.phase,
                nextSpeaker.role,
                decision.objective
              );

              return {
                ...prev,
                activeSpeakerId: null,
                voiceFlowState: 'listening',
                phase: isPhaseTransition,
                aiSpeakingDurationMs: prev.aiSpeakingDurationMs + durationMs,
                transcript: prev.transcript.map((t) =>
                  t.id === pendingTurnId
                    ? {
                        ...t,
                        deliveryState: 'complete',
                        deliveryStatus: 'fully_delivered',
                        deliveredText: generatedTurn.text,
                        playbackDurationMs: durationMs
                      }
                    : t
                ),
                events: [
                  ...prev.events,
                  createSessionEvent('tts_playback_complete', { speakerId: nextSpeaker.id, durationMs }),
                  createSessionEvent('turn_displayed', { turnId: pendingTurnId, speakerId: nextSpeaker.id })
                ]
              };
            });

            // Brief student-entry window before next AI speaks
            const pauseBetween = getTurnPauseMs(current.config.patience);
            scheduleCallback(genId, pauseBetween);
          },
          onInterrupted: (playedDurationMs, deliveredText) => {
            console.log(`[AudioPlayback] Turn ${pendingTurnId} interrupted after ${playedDurationMs}ms`);
            setState((prev) => ({
              ...prev,
              activeSpeakerId: null,
              aiSpeakingDurationMs: prev.aiSpeakingDurationMs + playedDurationMs,
              transcript: prev.transcript.map((t) =>
                t.id === pendingTurnId
                  ? {
                      ...t,
                      deliveryState: 'complete',
                      deliveryStatus: 'interrupted',
                      deliveredText,
                      playbackDurationMs: playedDurationMs
                    }
                  : t
              ),
              events: [
                ...prev.events,
                createSessionEvent('tts_interrupted', {
                  speakerId: nextSpeaker.id,
                  playedDurationMs,
                  deliveredText
                })
              ]
            }));
          },
          onError: (err) => {
            console.warn('[TTS Playback Warning]:', err.message);
            // Complete turn gracefully
            setState((prev) => ({
              ...prev,
              activeSpeakerId: null,
              voiceFlowState: 'listening'
            }));
            scheduleCallback(genId, 1200);
          }
        });
      } else {
        // Text mode reading delay
        const readingDurationMs = Math.min(
          4600,
          Math.max(2800, generatedTurn.text.length * 32)
        );

        activeTimerRef.current = setTimeout(() => {
          if (generationRef.current !== genId) return;

          setState((prev) => {
            const isPhaseTransition = resolveNextPhase(
              prev.phase,
              nextSpeaker.role,
              decision.objective
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
                  deliveryState: 'complete',
                  deliveryStatus: 'fully_delivered',
                  deliveredText: generatedTurn.text
                }
              ],
              events: [
                ...prev.events,
                createSessionEvent('turn_displayed', {
                  turnId: generatedTurn.id,
                  speakerId: nextSpeaker.id
                })
              ]
            };
          });

          const pauseBetween = getTurnPauseMs(current.config.patience);
          scheduleCallback(genId, pauseBetween);
        }, readingDurationMs);
      }
    },
    [generateTurn]
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
          current.phase === 'setup' ||
          current.phase === 'completed' ||
          current.errorState !== null
        ) {
          return;
        }

        await executeNextTurn(genId, scheduleNextTurnRef.current);
      }, delayMs);
    },
    [executeNextTurn]
  );

  useEffect(() => {
    scheduleNextTurnRef.current = scheduleNextTurn;
  }, [scheduleNextTurn]);

  // Trigger turn scheduling when phase or pause state changes
  useEffect(() => {
    if (
      state.isPaused ||
      state.phase === 'setup' ||
      state.phase === 'completed' ||
      state.errorState !== null
    ) {
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
        activeTimerRef.current = null;
      }
      return;
    }

    if (state.activeSpeakerId || state.isGenerating || state.voiceFlowState === 'student_speaking') {
      return;
    }

    const currentGen = generationRef.current;
    scheduleNextTurn(currentGen, 1000);

    return () => {
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
        activeTimerRef.current = null;
      }
    };
  }, [
    state.isPaused,
    state.phase,
    state.activeSpeakerId,
    state.isGenerating,
    state.voiceFlowState,
    state.errorState,
    scheduleNextTurn
  ]);

  const submitStudentTurn = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const current = stateRef.current;
      if (current.phase !== 'discussion' && current.phase !== 'closing') return;

      // Student submission immediately cancels pending AI turn and aborts in-flight audio/generation
      const genId = bumpGeneration();

      const newTurn: TranscriptTurn = {
        id: `turn-student-${Date.now()}`,
        speakerId: STUDENT_PARTICIPANT.id,
        speakerName: STUDENT_PARTICIPANT.name,
        speakerRole: 'student',
        text: trimmed,
        deliveredText: trimmed,
        deliveryStatus: 'fully_delivered',
        relativeTimestampMs: current.elapsedSeconds * 1000,
        source: 'student',
        deliveryState: 'complete'
      };

      const isClosingTurn = current.phase === 'closing';

      setState((prev) => ({
        ...prev,
        activeSpeakerId: STUDENT_PARTICIPANT.id,
        voiceFlowState: 'student_speaking',
        isGenerating: false,
        generatingSpeakerId: null,
        errorState: null,
        transcript: [...prev.transcript, newTurn],
        generationId: genId,
        studentHasSpokenInClosing: isClosingTurn ? true : prev.studentHasSpokenInClosing,
        acknowledgedStudentContribution: false,
        consecutiveAiTurns: 0,
        awaitingStudentOpportunity: false,
        liveCaption: '',
        events: [
          ...prev.events,
          createSessionEvent('student_turn_submitted', { textLength: trimmed.length })
        ]
      }));

      // Candidate remains highlighted briefly before AI responds
      activeTimerRef.current = setTimeout(() => {
        if (generationRef.current !== genId) return;

        setState((prev) => ({
          ...prev,
          activeSpeakerId: null,
          voiceFlowState: 'listening'
        }));

        const pauseBetween = getStudentPauseMs(current.config.patience);
        scheduleNextTurn(genId, pauseBetween);
      }, 1800);
    },
    [bumpGeneration, scheduleNextTurn]
  );

  // Manual interrupt / Take Floor action
  const interruptCurrentSpeaker = useCallback(() => {
    bumpGeneration();
    setState((prev) => ({
      ...prev,
      activeSpeakerId: STUDENT_PARTICIPANT.id,
      voiceFlowState: 'student_speaking',
      events: [...prev.events, createSessionEvent('tts_interrupted', { manual: true })]
    }));
  }, [bumpGeneration]);

  // Voice Recognition Streaming lifecycle
  useEffect(() => {
    const isLivePhase =
      state.phase === 'opening' || state.phase === 'discussion' || state.phase === 'closing';

    if (
      !isLivePhase ||
      state.isPaused ||
      state.interactionMode !== 'voice' ||
      state.isMicMuted ||
      state.errorState !== null
    ) {
      speechRecognitionService.stop();
      return;
    }

    let isSubscribed = true;

    async function initSTT() {
      await speechRecognitionService.start(
        {
          onSpeechStart: () => {
            if (!isSubscribed) return;
            studentSpeechStartRef.current = Date.now();

            // When AI is not speaking, immediately give candidate the floor
            if (!audioPlaybackService.getIsPlaying()) {
              if (inFlightAbortRef.current) {
                inFlightAbortRef.current.abort();
              }

              setState((prev) => ({
                ...prev,
                activeSpeakerId: STUDENT_PARTICIPANT.id,
                voiceFlowState: 'student_speaking',
                events: [...prev.events, createSessionEvent('student_speech_start')]
              }));
            }
          },
          onPartialTranscript: (text) => {
            if (!isSubscribed) return;
            const trimmed = text.trim();

            // Verified student barge-in: If AI is actively speaking and student utters verified words,
            // immediately halt AI playback and grant floor to student
            if (audioPlaybackService.getIsPlaying() && trimmed.length >= 4) {
              sarvamSpeechProvider.stop();
              if (inFlightAbortRef.current) {
                inFlightAbortRef.current.abort();
              }
              setState((prev) => ({
                ...prev,
                activeSpeakerId: STUDENT_PARTICIPANT.id,
                voiceFlowState: 'student_speaking',
                liveCaption: text,
                events: [...prev.events, createSessionEvent('student_speech_start')]
              }));
              return;
            }

            setState((prev) => ({
              ...prev,
              liveCaption: text
            }));
          },
          onTurnCommitted: (text) => {
            if (!isSubscribed) return;
            const trimmed = text.trim();
            if (!trimmed || trimmed.length < 3) {
              setState((prev) => ({ ...prev, liveCaption: '' }));
              return;
            }

            const speakingDur = Math.max(800, Date.now() - studentSpeechStartRef.current);

            setState((prev) => ({
              ...prev,
              studentSpeakingDurationMs: prev.studentSpeakingDurationMs + speakingDur,
              liveCaption: '',
              events: [
                ...prev.events,
                createSessionEvent('student_speech_end', { durationMs: speakingDur })
              ]
            }));

            submitStudentTurn(trimmed);
          },

          onError: (err) => {
            console.warn('[STT Service Notice]:', err.message);
          }
        },
        {
          patience: state.config.patience,
          language: state.config.language,
          preferGateway: true
        }
      );
    }

    void initSTT();

    return () => {
      isSubscribed = false;
      speechRecognitionService.stop();
    };
  }, [
    state.phase,
    state.isPaused,
    state.interactionMode,
    state.isMicMuted,
    state.config.patience,
    state.config.language,
    state.errorState,
    submitStudentTurn
  ]);

  const startSession = useCallback(
    (config: RoomConfig) => {
      const genId = bumpGeneration();
      setIsRestoredSession(false);

      const participants = [
        STUDENT_PARTICIPANT,
        MODERATOR,
        ...getParticipantsForPanel(config.participantCount)
      ];

      const initialEngine: EngineMode = resolveInitialEngine(
        config.preferredEngine,
        stateRef.current.isAiConfigured
      );

      setState({
        phase: 'opening',
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
          createSessionEvent('session_started', {
            topic: config.topic,
            engineMode: initialEngine,
            interactionMode: config.mode || 'voice'
          })
        ],
        consecutiveAiTurns: 0,
        awaitingStudentOpportunity: false,
        isAiConfigured: stateRef.current.isAiConfigured,
        interactionMode: config.mode || 'voice',
        voiceFlowState: 'listening',
        liveCaption: '',
        studentSpeakingDurationMs: 0,
        aiSpeakingDurationMs: 0,
        isAudioBlocked: false,
        isMicMuted: false
      });
    },
    [bumpGeneration]
  );

  const pauseSession = useCallback(() => {
    bumpGeneration();
    speechRecognitionService.stop();
    sarvamSpeechProvider.stop();

    setState((prev) => ({
      ...prev,
      isPaused: true,
      activeSpeakerId: null,
      voiceFlowState: 'paused',
      isGenerating: false,
      generatingSpeakerId: null,
      events: [...prev.events, createSessionEvent('session_paused')]
    }));
  }, [bumpGeneration]);

  const resumeSession = useCallback(() => {
    const genId = bumpGeneration();
    setIsRestoredSession(false);
    setState((prev) => ({
      ...prev,
      isPaused: false,
      activeSpeakerId: null,
      voiceFlowState: 'listening',
      isGenerating: false,
      generatingSpeakerId: null,
      errorState: null,
      generationId: genId,
      events: [...prev.events, createSessionEvent('session_resumed')]
    }));
  }, [bumpGeneration]);

  const endSession = useCallback(() => {
    bumpGeneration();
    speechRecognitionService.stop();
    sarvamSpeechProvider.stop();

    setState((prev) => ({
      ...prev,
      phase: 'completed',
      isPaused: true,
      activeSpeakerId: null,
      voiceFlowState: 'completed',
      isGenerating: false,
      generatingSpeakerId: null,
      events: [...prev.events, createSessionEvent('session_ended')]
    }));
  }, [bumpGeneration]);

  const resetSession = useCallback(() => {
    bumpGeneration();
    clearSessionFromStorage();
    speechRecognitionService.stop();
    sarvamSpeechProvider.stop();
    setIsRestoredSession(false);
    setReport(null);
    setIsGeneratingReport(false);
    setReportError(null);

    setState({
      phase: 'setup',
      isPaused: false,
      activeSpeakerId: null,
      config: DEFAULT_CONFIG,
      participants: [
        STUDENT_PARTICIPANT,
        MODERATOR,
        ...getParticipantsForPanel(DEFAULT_CONFIG.participantCount)
      ],
      transcript: [],
      elapsedSeconds: 0,
      totalDurationSeconds: DEFAULT_CONFIG.durationMinutes * 60,
      generationId: 1,
      isCaptionsVisible: true,
      studentHasSpokenInClosing: false,
      acknowledgedStudentContribution: false,
      engineMode: stateRef.current.isAiConfigured ? 'ai' : 'demo',
      isGenerating: false,
      generatingSpeakerId: null,
      errorState: null,
      events: [createSessionEvent('session_started')],
      consecutiveAiTurns: 0,
      awaitingStudentOpportunity: false,
      isAiConfigured: stateRef.current.isAiConfigured,
      interactionMode: 'voice',
      voiceFlowState: 'idle',
      liveCaption: '',
      studentSpeakingDurationMs: 0,
      aiSpeakingDurationMs: 0,
      isAudioBlocked: false,
      isMicMuted: false
    });
  }, [bumpGeneration]);

  const jumpToClosing = useCallback(() => {
    const genId = bumpGeneration();
    sarvamSpeechProvider.stop();

    setState((prev) => ({
      ...prev,
      phase: 'closing',
      activeSpeakerId: null,
      voiceFlowState: 'listening',
      isGenerating: false,
      generatingSpeakerId: null,
      generationId: genId,
      elapsedSeconds: Math.max(prev.elapsedSeconds, prev.totalDurationSeconds - 40),
      events: [...prev.events, createSessionEvent('phase_changed', { phase: 'closing' })]
    }));
  }, [bumpGeneration]);

  const skipStudentClosing = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'closing') return;

    const genId = bumpGeneration();
    setState((prev) => ({
      ...prev,
      studentHasSpokenInClosing: true,
      activeSpeakerId: null,
      voiceFlowState: 'listening',
      isGenerating: false,
      generatingSpeakerId: null,
      generationId: genId
    }));
    scheduleNextTurn(genId, 600);
  }, [bumpGeneration, scheduleNextTurn]);

  const switchToDemoMode = useCallback(() => {
    setState((prev) => ({
      ...prev,
      engineMode: 'demo',
      errorState: null,
      isGenerating: false,
      generatingSpeakerId: null,
      events: [...prev.events, createSessionEvent('switched_to_demo', { manual: true })]
    }));
    const genId = bumpGeneration();
    scheduleNextTurn(genId, 800);
  }, [bumpGeneration, scheduleNextTurn]);

  const retryGeneration = useCallback(() => {
    setState((prev) => ({
      ...prev,
      errorState: null,
      isGenerating: false,
      generatingSpeakerId: null
    }));
    const genId = bumpGeneration();
    scheduleNextTurn(genId, 600);
  }, [bumpGeneration, scheduleNextTurn]);

  const toggleCaptions = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isCaptionsVisible: !prev.isCaptionsVisible
    }));
  }, []);

  const setMicMuted = useCallback((muted: boolean) => {
    setState((prev) => ({
      ...prev,
      isMicMuted: muted
    }));
  }, []);

  const setInteractionMode = useCallback((mode: InteractionMode) => {
    setState((prev) => ({
      ...prev,
      interactionMode: mode
    }));
  }, []);

  const unlockAudio = useCallback(async () => {
    await audioPlaybackService.unlockAudio();
    setState((prev) => ({
      ...prev,
      isAudioBlocked: false
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
      if (!forceRegenerate && report && report.sessionFingerprint === currentFp) {
        return;
      }

      setIsGeneratingReport(true);
      setReportError(null);

      try {
        const response = await fetch('/api/discussion/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: state.config.topic,
            language: state.config.language,
            transcript: state.transcript,
            timingEvents: [],
            activeDurationMs: state.elapsedSeconds * 1000,
            isVoiceMode: state.interactionMode === 'voice',
            isDemoMode: state.engineMode === 'demo',
            sessionFingerprint: currentFp
          })
        });

        const data = await response.json();
        if (data.success && data.report) {
          setReport(data.report);
          saveSessionToStorage(state, data.report);
        } else {
          setReportError(data.error || 'Failed to generate discussion report.');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setReportError(msg || 'Network error while generating report.');
      } finally {
        setIsGeneratingReport(false);
      }
    },
    [state, report]
  );

  // Auto-generate report when entering completed phase if missing
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (state.phase === 'completed' && !report && !isGeneratingReport && !reportError) {
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
      generateReport
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
      generateReport
    ]
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
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
