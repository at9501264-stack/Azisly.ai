import { RoomConfig, SessionState, TranscriptTurn, EngineMode, RecordedSessionEvent, InteractionMode } from '@/types/session';
import { SessionReport } from '@/types/report';

const STORAGE_KEY = 'gd_arena_session_v4';

export interface StoredSessionPayload {
  version: 4;
  config: RoomConfig;
  transcript: TranscriptTurn[];
  elapsedSeconds: number;
  totalDurationSeconds: number;
  phase: SessionState['phase'];
  isCaptionsVisible: boolean;
  studentHasSpokenInClosing: boolean;
  engineMode: EngineMode;
  interactionMode: InteractionMode;
  studentSpeakingDurationMs: number;
  aiSpeakingDurationMs: number;
  events: RecordedSessionEvent[];
  report?: SessionReport | null;
  savedAt: number;
}

export function saveSessionToStorage(state: SessionState, report?: SessionReport | null): void {
  if (typeof window === 'undefined') return;

  try {
    const payload: StoredSessionPayload = {
      version: 4,
      config: state.config,
      transcript: state.transcript,
      elapsedSeconds: state.elapsedSeconds,
      totalDurationSeconds: state.totalDurationSeconds,
      phase: state.phase,
      isCaptionsVisible: state.isCaptionsVisible,
      studentHasSpokenInClosing: state.studentHasSpokenInClosing,
      engineMode: state.engineMode,
      interactionMode: state.interactionMode,
      studentSpeakingDurationMs: state.studentSpeakingDurationMs,
      aiSpeakingDurationMs: state.aiSpeakingDurationMs,
      events: state.events.slice(-50),
      report: report || undefined,
      savedAt: Date.now()
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[Storage] Failed to save session state to localStorage:', err);
  }
}

export function loadSessionFromStorage(): StoredSessionPayload | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredSessionPayload> | null;
    if ((parsed?.version !== 4 && parsed?.version !== (3 as unknown as 4)) || !parsed?.config || !Array.isArray(parsed?.transcript)) {
      console.warn('[Storage] Discarding incompatible or invalid saved session');
      clearSessionFromStorage();
      return null;
    }

    return parsed as StoredSessionPayload;
  } catch (err) {
    console.warn('[Storage] Failed to parse saved session state:', err);
    clearSessionFromStorage();
    return null;
  }
}

export function clearSessionFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[Storage] Failed to clear session from localStorage:', err);
  }
}
