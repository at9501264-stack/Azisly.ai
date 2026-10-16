"use client";

import React from "react";
import { ArrowUpRight, Lightbulb } from "lucide-react";
import { DimensionEvaluation } from "@/types/report";
import { RATING_STYLES, SKILL_TIPS, formatClock } from "./reportUi";

interface SkillCardProps {
  readonly dimension: DimensionEvaluation;
  readonly index: number;
  readonly onSelectTurn: (turnId: string) => void;
}

export function SkillCard({ dimension, index, onSelectTurn }: SkillCardProps) {
  const style = RATING_STYLES[dimension.rating] ?? RATING_STYLES["Not observed"];
  const Icon = style.icon;
  const isNotObserved = dimension.rating === "Not observed";
  const observation = isNotObserved
    ? "This round didn't give a clear moment to judge this skill."
    : dimension.observation;
  const tip = isNotObserved ? SKILL_TIPS[dimension.id] ?? dimension.actionableImprovement : dimension.actionableImprovement;

  return (
    <article className="flex flex-col rounded-xl border border-hair bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-serif text-lg font-semibold leading-snug text-ink">
          <span className="mr-1.5 text-muted">{index + 1}.</span>
          {dimension.name}
        </h3>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: style.bg, color: style.fg }}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {style.label}
        </span>
      </div>

      <p className={`mt-3 text-[15px] leading-relaxed ${isNotObserved ? "text-muted" : "text-ink"}`}>{observation}</p>

      {tip && (
        <div className="mt-4 flex gap-2.5 rounded-lg bg-paper px-3.5 py-3">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-ink">
            <span className="font-semibold">Try this next time: </span>
            {tip}
          </p>
        </div>
      )}

      <div className="mt-auto pt-4">
        {dimension.evidence.length > 0 ? (
          <ul className="m-0 list-none space-y-2 border-t border-hair p-0 pt-4">
            {dimension.evidence.map((ev, i) => (
              <li key={`${ev.turnId}-${i}`}>
                <button
                  type="button"
                  onClick={() => onSelectTurn(ev.turnId)}
                  className="group w-full cursor-pointer rounded-lg border-l-2 border-marigold bg-paper px-3 py-2 text-left transition-colors hover:bg-paper-2"
                >
                  <span className="block text-sm italic leading-relaxed text-ink">&ldquo;{ev.quote}&rdquo;</span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted group-hover:text-forest">
                    {ev.speakerName === "You (Student)" || !ev.speakerName ? "You" : ev.speakerName} ·{" "}
                    {formatClock(ev.relativeTimestampMs ?? 0)}
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    <span className="sr-only">Jump to this moment in the transcript</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : isNotObserved ? null : (
          <p className="border-t border-hair pt-4 text-xs text-muted">No direct quote was cited for this skill.</p>
        )}
      </div>
    </article>
  );
}
