"use client";

import React from "react";
import { Clock } from "lucide-react";
import { DiscussionPhase, EngineMode } from "@/types/session";

interface RoomHeaderProps {
  readonly phase: DiscussionPhase;
  readonly remainingSeconds: number;
  readonly isPaused: boolean;
  readonly engineMode: EngineMode;
}

const STEPS: { phase: DiscussionPhase; label: string }[] = [
  { phase: "opening", label: "Opening" },
  { phase: "discussion", label: "Discussion" },
  { phase: "closing", label: "Closing" },
];

export function RoomHeader({ phase, remainingSeconds, isPaused, engineMode }: RoomHeaderProps) {
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const time = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  const activeIndex = STEPS.findIndex((s) => s.phase === phase);
  const isLowTime = remainingSeconds < 60;

  return (
    <header className="sticky top-0 z-30 border-b border-hair bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-forest text-[11px] font-bold tracking-wide text-paper">
            GD
          </span>
          <span className="hidden font-serif text-xl font-semibold tracking-tight text-ink sm:inline">GD Arena</span>
          {engineMode === "demo" && (
            <span className="rounded bg-paper-2 px-2 py-0.5 text-[11px] font-medium text-muted">Demo panel</span>
          )}
        </div>

        {/* Phase progress */}
        <ol className="m-0 hidden list-none items-center gap-2 p-0 md:flex" aria-label="Discussion phase">
          {STEPS.map((step, i) => {
            const isDone = activeIndex > i;
            const isActive = activeIndex === i;
            return (
              <li key={step.phase} className="flex items-center gap-2">
                {i > 0 && <span className={`h-px w-8 ${isDone || isActive ? "bg-forest" : "bg-hair"}`} />}
                <span
                  aria-current={isActive ? "step" : undefined}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    isActive ? "bg-forest text-paper" : isDone ? "text-forest" : "text-muted"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>

        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 tabular-nums ${
            isLowTime ? "border-danger/30 bg-[#f3ddd8] text-danger" : "border-hair bg-card text-ink"
          }`}
          aria-label={`Time remaining ${time}`}
        >
          <Clock className="h-4 w-4" />
          <span className="text-base font-semibold">{time}</span>
          {isPaused && <span className="text-xs font-medium text-muted">Paused</span>}
        </div>
      </div>
    </header>
  );
}
