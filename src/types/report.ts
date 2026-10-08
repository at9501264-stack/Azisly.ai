import { ParticipantRole } from './session';

export type ReportDimensionId =
  | 'starting_discussion'
  | 'idea_quality'
  | 'building_on_others'
  | 'active_listening'
  | 'handling_disagreement'
  | 'ending_strongly';

export type DimensionRating = 'Strength' | 'Developing' | 'Needs practice' | 'Not observed';

export interface EvidenceReference {
  turnId: string;
  quote: string;
  speakerName?: string;
  speakerRole?: ParticipantRole;
  relativeTimestampMs?: number;
  isValidated?: boolean;
}

export interface DimensionEvaluation {
  id: ReportDimensionId;
  name: string;
  rating: DimensionRating;
  observation: string;
  actionableImprovement: string;
  evidence: EvidenceReference[];
}

export interface AlternativeOpportunity {
  targetTurnId: string;
  speakerName: string;
  opportunityContext: string;
  suggestedSpeech: string;
  objective: string;
}

export interface DeterministicMetrics {
  isVoiceMode: boolean;
  isDemoMode: boolean;
  actualDurationMs: number;
  studentSpeakingDurationMs: number | null; // null if text-only
  aiPlaybackDurationMs: Record<string, number>;
  moderatorPlaybackDurationMs: number;
  totalActiveSpeakingDurationMs: number;
  speakingSharePercent: Record<string, number>; // denominator is totalActiveSpeakingDurationMs
  turnCountsBySpeaker: Record<string, number>;
  totalTurns: number;
  studentFirstContributionSecs: number | null;
  studentContributedInClosing: boolean;
  interruptedTurnsCount: number;
}

export interface SessionReport {
  id: string;
  sessionFingerprint: string;
  generatedAt: number;
  metrics: DeterministicMetrics;
  dimensions: DimensionEvaluation[];
  alternativeOpportunity?: AlternativeOpportunity | null;
  disclaimer: string;
  modelUsed?: string;
}
