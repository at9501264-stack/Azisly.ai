import {
  TranscriptTurn,
  DiscussionTimingEvent,
  SessionState
} from '@/types/session';
import { DeterministicMetrics } from '@/types/report';
import { STUDENT_PARTICIPANT, MODERATOR } from '@/constants/participants';

export interface TimingInterval {
  startMs: number;
  endMs: number;
}

/**
 * Merges overlapping intervals belonging to the same speaker to prevent double-counting.
 */
export function mergeIntervals(intervals: TimingInterval[]): TimingInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  const result: TimingInterval[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const prev = result[result.length - 1];

    if (current.startMs <= prev.endMs) {
      prev.endMs = Math.max(prev.endMs, current.endMs);
    } else {
      result.push({ ...current });
    }
  }

  return result;
}

export interface CalculateSessionMetricsParams {
  transcript: TranscriptTurn[];
  timingEvents?: DiscussionTimingEvent[];
  activeDurationMs: number;
  isVoiceMode: boolean;
  isDemoMode: boolean;
}

export function calculateSessionMetrics(
  params: CalculateSessionMetricsParams
): DeterministicMetrics {
  const {
    transcript = [],
    timingEvents = [],
    activeDurationMs,
    isVoiceMode,
    isDemoMode
  } = params;

  const totalTurns = transcript.length;

  // 1. Turn counts by speaker
  const turnCountsBySpeaker: Record<string, number> = {};
  for (const turn of transcript) {
    turnCountsBySpeaker[turn.speakerId] = (turnCountsBySpeaker[turn.speakerId] || 0) + 1;
  }

  // 2. Student's first contribution time in seconds
  const firstStudentTurn = transcript.find((t) => t.speakerRole === 'student');
  const studentFirstContributionSecs = firstStudentTurn
    ? Math.round(firstStudentTurn.relativeTimestampMs / 1000)
    : null;

  // 3. Student closing contribution
  const studentContributedInClosing = transcript.some(
    (t) => t.speakerRole === 'student' && t.phase === 'closing'
  );

  // 4. Interruption overlap occurrences (neutral overlap events)
  const interruptedTurnsCount = transcript.filter(
    (t) => t.deliveryStatus === 'interrupted'
  ).length;

  // 5. Durations calculation
  const aiPlaybackDurationMs: Record<string, number> = {};
  let moderatorPlaybackDurationMs = 0;
  let studentSpeakingDurationMs: number | null = null;

  if (isVoiceMode) {
    if (timingEvents.length > 0) {
      // Use timing events with same-speaker interval merging
      const studentIntervals = timingEvents
        .filter((e) => e.type === 'student_speech')
        .map((e) => ({ startMs: e.startMs, endMs: e.endMs }));
      studentSpeakingDurationMs = mergeIntervals(studentIntervals).reduce(
        (acc, int) => acc + (int.endMs - int.startMs),
        0
      );

      const modIntervals = timingEvents
        .filter((e) => e.type === 'ai_playback' && e.speakerId === MODERATOR.id)
        .map((e) => ({ startMs: e.startMs, endMs: e.endMs }));
      moderatorPlaybackDurationMs = mergeIntervals(modIntervals).reduce(
        (acc, int) => acc + (int.endMs - int.startMs),
        0
      );

      // AI debaters
      const peerEvents = timingEvents.filter(
        (e) => e.type === 'ai_playback' && e.speakerId !== MODERATOR.id
      );
      const uniquePeerIds = Array.from(new Set(peerEvents.map((e) => e.speakerId)));
      for (const peerId of uniquePeerIds) {
        const intervals = peerEvents
          .filter((e) => e.speakerId === peerId)
          .map((e) => ({ startMs: e.startMs, endMs: e.endMs }));
        aiPlaybackDurationMs[peerId] = mergeIntervals(intervals).reduce(
          (acc, int) => acc + (int.endMs - int.startMs),
          0
        );
      }
    } else {
      // Aggregate playback duration recorded directly on turns
      for (const turn of transcript) {
        const dur = turn.playbackDurationMs || 0;
        if (turn.speakerRole === 'moderator') {
          moderatorPlaybackDurationMs += dur;
        } else if (turn.speakerRole === 'ai_participant') {
          aiPlaybackDurationMs[turn.speakerId] =
            (aiPlaybackDurationMs[turn.speakerId] || 0) + dur;
        }
      }
      studentSpeakingDurationMs = 0;
    }
  } else {
    // In text-only mode, speech duration is null
    studentSpeakingDurationMs = null;
  }

  // Ensure all peer speakers in transcript have an entry in aiPlaybackDurationMs
  for (const turn of transcript) {
    if (turn.speakerRole === 'ai_participant' && aiPlaybackDurationMs[turn.speakerId] === undefined) {
      aiPlaybackDurationMs[turn.speakerId] = 0;
    }
  }

  // Denominator: Total active speaking duration across all speakers
  let totalActiveSpeakingDurationMs = 0;
  if (studentSpeakingDurationMs !== null) {
    totalActiveSpeakingDurationMs += studentSpeakingDurationMs;
  }
  totalActiveSpeakingDurationMs += moderatorPlaybackDurationMs;
  for (const dur of Object.values(aiPlaybackDurationMs)) {
    totalActiveSpeakingDurationMs += dur;
  }

  // 6. Speaking share percentages
  const speakingSharePercent: Record<string, number> = {};
  if (isVoiceMode && totalActiveSpeakingDurationMs > 0) {
    if (studentSpeakingDurationMs !== null) {
      speakingSharePercent[STUDENT_PARTICIPANT.id] = Math.round(
        (studentSpeakingDurationMs / totalActiveSpeakingDurationMs) * 100
      );
    }
    speakingSharePercent[MODERATOR.id] = Math.round(
      (moderatorPlaybackDurationMs / totalActiveSpeakingDurationMs) * 100
    );
    for (const [id, dur] of Object.entries(aiPlaybackDurationMs)) {
      speakingSharePercent[id] = Math.round((dur / totalActiveSpeakingDurationMs) * 100);
    }
  } else if (totalTurns > 0) {
    // Text-only mode: share derived from discrete committed turn counts
    for (const [id, count] of Object.entries(turnCountsBySpeaker)) {
      speakingSharePercent[id] = Math.round((count / totalTurns) * 100);
    }
  }

  return {
    isVoiceMode,
    isDemoMode,
    actualDurationMs: activeDurationMs || 0,
    studentSpeakingDurationMs,
    aiPlaybackDurationMs,
    moderatorPlaybackDurationMs,
    totalActiveSpeakingDurationMs,
    speakingSharePercent,
    turnCountsBySpeaker,
    totalTurns,
    studentFirstContributionSecs,
    studentContributedInClosing,
    interruptedTurnsCount
  };
}

/**
 * Convenience wrapper for SessionState
 */
export function calculateDeterministicMetrics(state: SessionState): DeterministicMetrics {
  return calculateSessionMetrics({
    transcript: state.transcript,
    timingEvents: [],
    activeDurationMs: state.elapsedSeconds * 1000,
    isVoiceMode: state.interactionMode === 'voice',
    isDemoMode: state.engineMode === 'demo'
  });
}
