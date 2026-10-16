import React from "react";
import { Participant } from "@/types/session";
import { getPersonaColor } from "@/constants/personaColors";

interface PersonaAvatarProps {
  readonly participant: Pick<Participant, "id" | "initials" | "name">;
  readonly size?: "sm" | "md" | "lg";
  /** Outline in the surrounding surface colour so overlapping avatars stay separated */
  readonly outlineColor?: string;
  readonly className?: string;
}

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-xs",
  lg: "h-12 w-12 text-sm",
} as const;

export function PersonaAvatar({
  participant,
  size = "md",
  outlineColor,
  className = "",
}: PersonaAvatarProps) {
  const color = getPersonaColor(participant.id);

  return (
    <span
      role="img"
      aria-label={participant.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZE_CLASSES[size]} ${className}`}
      style={{
        background: color.hex,
        color: color.onHex,
        boxShadow: outlineColor ? `0 0 0 2px ${outlineColor}` : undefined,
      }}
    >
      {participant.initials}
    </span>
  );
}
