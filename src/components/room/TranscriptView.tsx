'use client';

import React, { useEffect, useRef } from 'react';
import { TranscriptTurn, Participant } from '@/types/session';
import { PersonaAvatar } from '@/components/ui/PersonaAvatar';
import { STUDENT_PARTICIPANT } from '@/constants/participants';

interface TranscriptViewProps {
  readonly transcript: TranscriptTurn[];
  readonly participants: Participant[];
  readonly activeSpeakerId?: string | null;
  readonly liveCaption?: string;
  readonly isGenerating?: boolean;
  readonly generatingSpeakerName?: string | null;
}

function formatTime(ms: number) {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function TranscriptView({
  transcript,
  participants,
  activeSpeakerId,
  liveCaption,
  isGenerating,
  generatingSpeakerName,
}: TranscriptViewProps) {
  const scrollEndRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view
  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcript.length, liveCaption, isGenerating]);

  const findParticipant = (turn: TranscriptTurn) =>
    participants.find((p) => p.id === turn.speakerId) ?? {
      id: turn.speakerId,
      name: turn.speakerName,
      initials: turn.speakerName.slice(0, 2).toUpperCase(),
    };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-hair px-4 py-3">
        <h2 className="font-serif text-base font-semibold text-ink">Transcript</h2>
        <span className="text-xs text-muted">
          {transcript.length} {transcript.length === 1 ? 'turn' : 'turns'}
        </span>
      </div>

      <ol className="m-0 flex-1 list-none space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {transcript.length === 0 && !liveCaption && (
          <li className="py-10 text-center text-sm text-muted">
            Prof. Sharma is about to open the discussion…
          </li>
        )}

        {transcript.map((turn, index) => {
          const isStudent = turn.speakerRole === 'student';
          const isInterrupted = turn.deliveryStatus === 'interrupted';
          const isInProgress = turn.deliveryState === 'in-progress';
          // A queued line isn't shown until its speaker is actually heard
          const isQueued = isInProgress && turn.speakerId !== activeSpeakerId;
          const text = isInterrupted && turn.deliveredText ? turn.deliveredText : turn.text;

          return (
            <li key={turn.id || `turn-${index}`} id={`turn-${turn.id}`} className="flex gap-3">
              <PersonaAvatar participant={findParticipant(turn)} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-ink">{isStudent ? 'You' : turn.speakerName}</span>
                  <span className="text-[11px] tabular-nums text-muted">{formatTime(turn.relativeTimestampMs)}</span>
                  {isInProgress && !isQueued && <span className="text-[11px] font-medium text-forest">speaking</span>}
                  {isInterrupted && <span className="text-[11px] font-medium text-danger">cut off</span>}
                </div>
                <p
                  className={`mt-1 rounded-lg px-3 py-2 text-sm leading-relaxed text-ink ${
                    isStudent ? 'bg-marigold-soft' : 'bg-paper'
                  }`}
                >
                  {isQueued ? <span className="italic text-muted">about to speak…</span> : text}
                  {isInterrupted && turn.deliveredText && turn.deliveredText !== turn.text && <span className="text-muted"> —</span>}
                </p>
              </div>
            </li>
          );
        })}

        {Boolean(liveCaption) && (
          <li className="flex gap-3">
            <PersonaAvatar participant={STUDENT_PARTICIPANT} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-ink">You</span>
                <span className="text-[11px] font-medium text-forest">transcribing…</span>
              </div>
              <p className="mt-1 rounded-lg border border-dashed border-marigold bg-marigold-soft/50 px-3 py-2 text-sm italic leading-relaxed text-ink">
                {liveCaption}
              </p>
            </div>
          </li>
        )}

        {Boolean(isGenerating) && (
          <li className="text-xs italic text-muted">{generatingSpeakerName || 'The next speaker'} is about to respond…</li>
        )}

        <div ref={scrollEndRef} />
      </ol>
    </div>
  );
}
