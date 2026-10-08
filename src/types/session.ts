export type DiscussionPhase = 'setup' | 'opening' | 'discussion' | 'closing' | 'completed';

export type LanguagePreference = 'english' | 'hinglish';

export type AIPatience = 'quick' | 'balanced' | 'patient';

export type TurnSource = 'student' | 'scripted-demo' | 'model';

export type DeliveryState = 'queued' | 'in-progress' | 'complete';

export type EngineMode = 'ai' | 'demo';

export type InteractionMode = 'voice' | 'text';

export type TurnDeliveryStatus = 'fully_delivered' | 'interrupted' | 'unplayed';

export type VoiceFlowState =
  | 'idle'
  | 'listening'
  | 'student_speaking'
  | 'thinking'
  | 'ai_speaking'
  | 'paused'
  | 'reconnecting'
  | 'error'
  | 'completed';

export interface RoomConfig {
  topic: string;
  isCustomTopic: boolean;
  participantCount: 3 | 4 | 5; // AI count excluding moderator & student
  language: LanguagePreference;
  durationMinutes: 5 | 8 | 10;
  patience: AIPatience;
  preferredEngine?: EngineMode;
  mode?: InteractionMode;
}

export type ParticipantRole = 'moderator' | 'student' | 'ai_participant';

export interface ParticipantVoiceConfig {
  sarvamVoice: string; // e.g. 'ratan', 'aditya', 'ishita', 'kabir', 'kavya', 'dev'
  pace: number;
  pitch?: number;
}

export interface Participant {
  id: string;
  name: string;
  role: ParticipantRole;
  initials: string;
  personality: string;
  tagline: string;
  avatarColor: string;
  accentColor: string;
  voice?: ParticipantVoiceConfig;
}

export interface TranscriptTurn {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerRole: ParticipantRole;
  text: string;
  relativeTimestampMs: number; // Elapsed session time when turn was spoken
  source: TurnSource;
  deliveryState: DeliveryState;
  isDemoResponse?: boolean; // Highlighted demo-simulated reply
  replyToSpeakerId?: string;
  addressedParticipantId?: string | null;
  stanceUpdate?: string;
  // Phase 3 speech attributes
  deliveredText?: string; // Text actually spoken/heard before any interruption
  deliveryStatus?: TurnDeliveryStatus;
  playbackDurationMs?: number; // Measured audio playback duration
  phase?: DiscussionPhase;
}

export interface DiscussionTimingEvent {
  type: 'student_speech' | 'ai_playback';
  speakerId: string;
  startMs: number;
  endMs: number;
}

export interface SessionMetrics {
  turnCountsBySpeaker: Record<string, number>;
  totalTurns: number;
  actualDurationMs: number;
  studentSpeakingDurationMs: number;
  aiSpeakingDurationMs: number;
  interruptedTurnCount: number;
}

export type SessionEventType =
  | 'session_started'
  | 'phase_changed'
  | 'student_turn_submitted'
  | 'ai_generation_started'
  | 'ai_generation_completed'
  | 'ai_generation_failed'
  | 'ai_generation_cancelled'
  | 'turn_displayed'
  | 'session_paused'
  | 'session_resumed'
  | 'session_ended'
  | 'switched_to_demo'
  // Phase 3 events
  | 'student_speech_start'
  | 'student_speech_end'
  | 'tts_request_start'
  | 'tts_playback_start'
  | 'tts_playback_complete'
  | 'tts_interrupted'
  | 'connection_lost'
  | 'connection_restored'
  | 'mic_permission_granted'
  | 'mic_permission_denied'
  | 'audio_unlocked';

export interface RecordedSessionEvent {
  id: string;
  type: SessionEventType;
  timestampMs: number;
  data?: Record<string, unknown>;
}

export interface SessionErrorState {
  message: string;
  code?: string;
  retryable: boolean;
}

export interface SessionState {
  phase: DiscussionPhase;
  isPaused: boolean;
  activeSpeakerId: string | null;
  config: RoomConfig;
  participants: Participant[];
  transcript: TranscriptTurn[];
  elapsedSeconds: number;
  totalDurationSeconds: number;
  generationId: number; // Stale async cancellation counter
  isCaptionsVisible: boolean;
  studentHasSpokenInClosing: boolean;
  acknowledgedStudentContribution: boolean;
  engineMode: EngineMode;
  isGenerating: boolean;
  generatingSpeakerId: string | null;
  errorState: SessionErrorState | null;
  events: RecordedSessionEvent[];
  consecutiveAiTurns: number;
  awaitingStudentOpportunity: boolean;
  isAiConfigured: boolean | null; // null = checking, true/false = known
  // Phase 3 state
  interactionMode: InteractionMode;
  voiceFlowState: VoiceFlowState;
  liveCaption: string; // Transient in-flight speech caption
  studentSpeakingDurationMs: number;
  aiSpeakingDurationMs: number;
  isAudioBlocked: boolean;
  isMicMuted: boolean;
}

export type SessionEvent =
  | { type: 'START_SESSION'; config: RoomConfig }
  | { type: 'RESUME' }
  | { type: 'PAUSE' }
  | { type: 'END_SESSION' }
  | { type: 'RESET_SESSION' }
  | { type: 'JUMP_TO_CLOSING' }
  | { type: 'TICK'; elapsedSeconds: number }
  | { type: 'SPEAKER_START'; speakerId: string }
  | { type: 'SPEAKER_STOP' }
  | { type: 'APPEND_TURN'; turn: TranscriptTurn }
  | { type: 'SUBMIT_STUDENT_TURN'; text: string }
  | { type: 'TOGGLE_CAPTIONS' }
  | { type: 'TRANSITION_PHASE'; phase: DiscussionPhase }
  | { type: 'SWITCH_TO_DEMO' }
  | { type: 'RETRY_GENERATION' }
  // Phase 3 events
  | { type: 'SET_VOICE_FLOW_STATE'; state: VoiceFlowState }
  | { type: 'SET_LIVE_CAPTION'; caption: string }
  | { type: 'SET_AUDIO_BLOCKED'; blocked: boolean }
  | { type: 'SET_MIC_MUTED'; muted: boolean }
  | { type: 'INTERRUPT_CURRENT_SPEAKER' };
