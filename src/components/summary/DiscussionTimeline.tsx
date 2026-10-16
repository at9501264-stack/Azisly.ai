"use client";

import React, { useState } from "react";
import { Participant, TranscriptTurn } from "@/types/session";
import { CHART_OTHERS, CHART_TRACK, CHART_YOU, formatClock } from "./reportUi";

interface DiscussionTimelineProps {
  readonly participants: Participant[];
  readonly transcript: TranscriptTurn[];
  readonly durationMs: number;
  readonly onSelectTurn: (turnId: string) => void;
}

/** Spoken length of a turn: measured playback when known, else ~2.5 words per second. */
function turnLengthMs(turn: TranscriptTurn): number {
  if (turn.playbackDurationMs && turn.playbackDurationMs > 0) return turn.playbackDurationMs;
  const words = (turn.deliveredText || turn.text).split(/\s+/).filter(Boolean).length;
  return Math.max(1500, (words / 2.5) * 1000);
}

export function DiscussionTimeline({ participants, transcript, durationMs, onSelectTurn }: DiscussionTimelineProps) {
  const [hover, setHover] = useState<{ turn: TranscriptTurn; leftPct: number } | null>(null);

  const lanes = [
    ...participants.filter((p) => p.role === "moderator"),
    ...participants.filter((p) => p.role === "ai_participant"),
    ...participants.filter((p) => p.role === "student"),
  ];
  const lastTurnEnd = transcript.reduce(
    (max, t) => Math.max(max, t.relativeTimestampMs + turnLengthMs(t)),
    0,
  );
  const span = Math.max(durationMs, lastTurnEnd, 60_000);
  const pct = (ms: number) => (ms / span) * 100;
  const tickEveryMs = span > 6 * 60_000 ? 120_000 : 60_000;
  const ticks = Array.from({ length: Math.floor(span / tickEveryMs) + 1 }, (_, i) => i * tickEveryMs);

  return (
    <figure className="m-0">
      <figcaption className="mb-4 text-sm text-muted">
        Who spoke when. Each block is one turn; hover to read it, click to jump to the transcript.
      </figcaption>

      <div className="relative" onMouseLeave={() => setHover(null)}>
        <ul className="m-0 list-none space-y-2 p-0">
          {lanes.map((p) => {
            const isYou = p.role === "student";
            const turns = transcript.filter((t) => t.speakerId === p.id);
            return (
              <li key={p.id} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
                <span className={`truncate text-sm ${isYou ? "font-semibold text-ink" : "text-ink"}`}>
                  {isYou ? "You" : p.name}
                </span>
                <span className="relative block h-6 rounded" style={{ background: CHART_TRACK }}>
                  {turns.map((t) => {
                    const left = pct(t.relativeTimestampMs);
                    const width = Math.max(0.8, pct(turnLengthMs(t)));
                    const isCut = t.deliveryStatus === "interrupted";
                    return (
                      <button
                        key={t.id}
                        type="button"
                        aria-label={`${isYou ? "You" : p.name} at ${formatClock(t.relativeTimestampMs)}${isCut ? ", cut off" : ""}`}
                        onClick={() => onSelectTurn(t.id)}
                        onMouseEnter={() => setHover({ turn: t, leftPct: left })}
                        onFocus={() => setHover({ turn: t, leftPct: left })}
                        className="absolute inset-y-[3px] cursor-pointer rounded-[3px] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
                        style={{
                          left: `${left}%`,
                          width: `${Math.min(width, 100 - left)}%`,
                          background: isYou ? CHART_YOU : CHART_OTHERS,
                          // Cut-off turns get a hatched end so status isn't colour-only
                          backgroundImage: isCut
                            ? "repeating-linear-gradient(135deg, transparent 0 3px, rgba(251,249,244,0.55) 3px 5px)"
                            : undefined,
                        }}
                      />
                    );
                  })}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Time axis */}
        <div className="mt-2 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <span />
          <span className="relative block h-4 text-[11px] tabular-nums text-muted">
            {ticks.map((t) => (
              <span key={t} className="absolute -translate-x-1/2" style={{ left: `${Math.min(pct(t), 98)}%` }}>
                {formatClock(t)}
              </span>
            ))}
          </span>
        </div>

        {hover && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 w-64 -translate-y-full rounded-md bg-ink px-3 py-2 text-xs text-paper shadow-lg"
            style={{ left: `clamp(0px, calc(${hover.leftPct}% + 6rem), calc(100% - 16rem))` }}
          >
            <span className="font-semibold">
              {hover.turn.speakerRole === "student" ? "You" : hover.turn.speakerName}
            </span>{" "}
            · {formatClock(hover.turn.relativeTimestampMs)}
            {hover.turn.deliveryStatus === "interrupted" && " · cut off"}
            <span className="mt-1 line-clamp-3 block text-paper/80">
              {hover.turn.deliveredText || hover.turn.text}
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: CHART_YOU }} /> You
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={{ background: CHART_OTHERS }} /> Panel
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-4 rounded-sm"
            style={{
              background: CHART_OTHERS,
              backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, rgba(251,249,244,0.55) 3px 5px)",
            }}
          />{" "}
          Cut off mid-sentence
        </span>
      </div>
    </figure>
  );
}
