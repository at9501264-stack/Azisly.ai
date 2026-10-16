"use client";

import React from "react";
import { Participant } from "@/types/session";
import { getPersonaColor } from "@/constants/personaColors";
import { Face } from "./Face";

interface SeatProps {
  readonly participant: Participant;
  readonly isSpeaking: boolean;
  readonly isThinking: boolean;
  readonly lookX: number;
  readonly size?: "sm" | "md" | "lg";
}

function SpeakingBars({ color }: { readonly color: string }) {
  return (
    <span className="flex h-3 items-end gap-[2px]" aria-hidden="true">
      {[0, 0.2, 0.4, 0.1].map((delay, i) => (
        <span
          key={i}
          className="eq-bar block w-[3px] rounded-sm"
          style={{ height: "100%", background: color, animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}

export function Seat({ participant, isSpeaking, isThinking, lookX, size = "md" }: SeatProps) {
  const color = getPersonaColor(participant.id);
  const isModerator = participant.role === "moderator";
  const frame = {
    sm: "h-20 w-20 lg:h-24 lg:w-24",
    md: "h-24 w-24 lg:h-28 lg:w-28",
    lg: "h-28 w-28 lg:h-36 lg:w-36",
  }[size];

  let status: React.ReactNode = (
    <span className="text-muted">
      {isModerator ? "Moderator" : participant.personality}
    </span>
  );
  if (isSpeaking) {
    status = (
      <span className="flex items-center gap-1.5 font-semibold" style={{ color: color.hex }}>
        <SpeakingBars color={color.hex} />
        Speaking
      </span>
    );
  } else if (isThinking) {
    status = <span className="italic text-muted">About to speak…</span>;
  }

  return (
    <figure className="m-0 flex flex-col items-center text-center" aria-live="off">
      <div className="relative">
        {/* Speaking halo */}
        <span
          aria-hidden="true"
          className={`absolute -inset-2 rounded-full transition-opacity duration-300 ${isSpeaking ? "opacity-100" : "opacity-0"}`}
          style={{ boxShadow: `0 0 0 3px ${color.hex}, 0 12px 32px -8px ${color.hex}` }}
        />
        <div
          className={`relative overflow-hidden rounded-full border-2 transition-transform duration-300 ${frame} ${
            isSpeaking ? "scale-[1.04]" : ""
          } ${isThinking ? "border-dashed" : ""}`}
          style={{ background: color.soft, borderColor: isThinking ? color.hex : "#e2dccf" }}
        >
          <Face
            participantId={participant.id}
            isSpeaking={isSpeaking}
            isThinking={isThinking}
            lookX={lookX}
            className="absolute inset-x-0 bottom-0 h-[112%] w-full"
          />
        </div>
        {isThinking && (
          <span className="absolute -right-1 -top-1 flex gap-0.5 rounded-full border border-hair bg-card px-2 py-1 shadow-sm" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </span>
        )}
      </div>

      <figcaption className="mt-2 rounded-lg border border-hair bg-card px-3 py-1.5 shadow-[0_1px_2px_rgba(26,26,23,0.05)]">
        <span className="flex items-center justify-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color.hex }} />
          <span className="text-sm font-semibold text-ink">{participant.name}</span>
        </span>
        <span className="mt-0.5 flex justify-center text-[11px]">{status}</span>
      </figcaption>
    </figure>
  );
}
