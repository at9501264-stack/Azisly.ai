export interface PersonaColor {
  /** Solid fill for avatars and markers */
  hex: string;
  /** Text colour that passes AA on top of `hex` */
  onHex: string;
  /** Pale tint for chips and selected backgrounds */
  soft: string;
}

/**
 * Muted earth tones from one warm family. Each persona stays distinguishable
 * (warm vs cool, light vs dark) without turning the panel into a rainbow.
 * Moderator uses the brand green, the student uses the marigold accent.
 */
export const PERSONA_COLORS: Record<string, PersonaColor> = {
  "mod-1": { hex: "#1e3a2f", onHex: "#ffffff", soft: "#e3ebe5" },
  "student-you": { hex: "#e3a13b", onHex: "#1a1a17", soft: "#f7e6c8" },
  "ai-aarav": { hex: "#a84b26", onHex: "#ffffff", soft: "#f3e1d8" },
  "ai-meera": { hex: "#3e5c76", onHex: "#ffffff", soft: "#e0e7ee" },
  "ai-kabir": { hex: "#74496a", onHex: "#ffffff", soft: "#ece2ea" },
  "ai-riya": { hex: "#8a6219", onHex: "#ffffff", soft: "#f1e8d6" },
  "ai-dev": { hex: "#536640", onHex: "#ffffff", soft: "#e5eadc" },
};

const FALLBACK: PersonaColor = { hex: "#6b675e", onHex: "#ffffff", soft: "#efebe2" };

export function getPersonaColor(participantId: string): PersonaColor {
  return PERSONA_COLORS[participantId] ?? FALLBACK;
}
