"use client";

import React, { useState } from "react";
import { Participant } from "@/types/session";
import { DeterministicMetrics } from "@/types/report";
import { CHART_OTHERS, CHART_TRACK, CHART_YOU, formatSpan } from "./reportUi";

interface AirtimeChartProps {
  readonly participants: Participant[];
  readonly metrics: DeterministicMetrics;
}

interface Row {
  id: string;
  name: string;
  role: string;
  share: number;
  turns: number;
  timeMs: number | null;
  isYou: boolean;
}

export function AirtimeChart({ participants, metrics }: AirtimeChartProps) {
  const [showTable, setShowTable] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const rows: Row[] = participants
    .map((p) => {
      let timeMs: number | null = null;
      if (metrics.isVoiceMode) {
        if (p.role === "student") timeMs = metrics.studentSpeakingDurationMs;
        else if (p.role === "moderator") timeMs = metrics.moderatorPlaybackDurationMs;
        else timeMs = metrics.aiPlaybackDurationMs[p.id] ?? 0;
      }
      return {
        id: p.id,
        name: p.role === "student" ? "You" : p.name,
        role: p.role === "student" ? "Candidate" : p.role === "moderator" ? "Moderator" : p.personality,
        share: metrics.speakingSharePercent[p.id] ?? 0,
        turns: metrics.turnCountsBySpeaker[p.id] ?? 0,
        timeMs,
        isYou: p.role === "student",
      };
    })
    .sort((a, b) => Number(b.isYou) - Number(a.isYou) || b.share - a.share);

  const evenSplit = Math.round(100 / Math.max(1, participants.length));
  const maxShare = Math.max(evenSplit, ...rows.map((r) => r.share), 1);
  const scale = (v: number) => `${(v / Math.min(100, maxShare * 1.15)) * 100}%`;
  const basis = metrics.isVoiceMode ? "speaking time" : "number of turns";

  return (
    <figure className="m-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <figcaption className="text-sm text-muted">
          Share of the discussion by {basis}. The dashed line marks an even split ({evenSplit}%).
        </figcaption>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="cursor-pointer rounded-md border border-hair bg-card px-2.5 py-1 text-xs font-medium text-muted hover:text-ink"
        >
          {showTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {showTable ? (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-hair text-left text-xs uppercase tracking-wide text-muted">
              <th className="py-2 font-medium">Speaker</th>
              <th className="py-2 text-right font-medium">Share</th>
              <th className="py-2 text-right font-medium">Turns</th>
              {metrics.isVoiceMode && <th className="py-2 text-right font-medium">Time</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-hair last:border-0">
                <td className={`py-2 ${r.isYou ? "font-semibold" : ""}`}>{r.name}</td>
                <td className="py-2 text-right tabular-nums">{r.share}%</td>
                <td className="py-2 text-right tabular-nums">{r.turns}</td>
                {metrics.isVoiceMode && <td className="py-2 text-right tabular-nums">{formatSpan(r.timeMs ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="relative m-0 list-none space-y-3 p-0" onMouseLeave={() => setHovered(null)}>
          {rows.map((r) => {
            const isHovered = hovered === r.id;
            return (
              <li
                key={r.id}
                className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_6rem]"
                onMouseEnter={() => setHovered(r.id)}
              >
                <span className="min-w-0">
                  <span className={`block truncate text-sm ${r.isYou ? "font-semibold text-ink" : "text-ink"}`}>{r.name}</span>
                  <span className="block truncate text-[11px] text-muted">{r.role}</span>
                </span>

                <span className="relative block h-7">
                  <span className="absolute inset-y-[6px] left-0 right-0 rounded" style={{ background: CHART_TRACK }} />
                  <span
                    className="absolute inset-y-[6px] left-0 rounded-r transition-all duration-500"
                    style={{
                      width: scale(r.share),
                      minWidth: r.share > 0 ? 4 : 0,
                      background: r.isYou ? CHART_YOU : CHART_OTHERS,
                      opacity: hovered && !isHovered ? 0.55 : 1,
                    }}
                  />
                  {/* Even-split reference */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 border-l-2 border-dashed border-ink/35"
                    style={{ left: scale(evenSplit) }}
                  />
                  {isHovered && (
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute -top-11 z-10 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs text-paper shadow-lg"
                      style={{ left: `min(${scale(r.share)}, calc(100% - 9rem))` }}
                    >
                      <strong className="font-semibold">{r.name}</strong> · {r.share}% · {r.turns}{" "}
                      {r.turns === 1 ? "turn" : "turns"}
                      {r.timeMs !== null && ` · ${formatSpan(r.timeMs)}`}
                    </span>
                  )}
                </span>

                <span className="text-right text-sm tabular-nums">
                  <span className={r.isYou ? "font-semibold text-ink" : "text-ink"}>{r.share}%</span>
                  <span className="hidden text-xs text-muted sm:inline"> · {r.turns}t</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </figure>
  );
}
