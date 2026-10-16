"use client";

import React, { useEffect, useRef } from "react";
import { PERSONA_LOOKS, PersonaLook } from "@/constants/personaLooks";
import { readOutputLevel } from "@/services/audio/audioLevelMeter";

interface FaceProps {
  readonly participantId: string;
  readonly isSpeaking: boolean;
  readonly isThinking?: boolean;
  /** Horizontal gaze, -1 (left) to 1 (right) */
  readonly lookX?: number;
  readonly className?: string;
}

const DEFAULT_LOOK: PersonaLook = {
  skin: "#d4a07a",
  skinShade: "#ba8660",
  hair: "#2a201b",
  hairStyle: "short",
  outfit: "#6b675e",
  lips: "#9a5444",
};

function HairBack({ look }: { readonly look: PersonaLook }) {
  if (look.hairStyle === "long") {
    return (
      <path
        d="M31 52 C30 24 46 17 60 17 C76 17 91 25 90 52 L93 99 C85 106 73 102 71 93 L49 93 C47 102 35 106 27 99 Z"
        fill={look.hair}
      />
    );
  }
  if (look.hairStyle === "bun") {
    return <circle cx="60" cy="21" r="10" fill={look.hair} />;
  }
  return null;
}

function HairFront({ look }: { readonly look: PersonaLook }) {
  switch (look.hairStyle) {
    case "long":
      return (
        <path d="M35 50 C36 30 48 24 62 25 C76 26 86 34 85 50 C78 40 66 34 56 36 C48 38 40 44 35 50 Z" fill={look.hair} />
      );
    case "bun":
      return (
        <path d="M35 50 C35 30 47 25 60 25 C74 25 86 32 85 50 C80 38 70 33 60 33 C50 33 40 38 35 50 Z" fill={look.hair} />
      );
    case "spiky":
      return (
        <path
          d="M35 48 C34 32 42 23 50 25 L54 16 L58 23 L64 15 L67 23 L74 18 L75 26 C83 30 86 38 85 48 C80 38 72 34 60 34 C48 34 40 38 35 48 Z"
          fill={look.hair}
        />
      );
    case "wavy":
      return (
        <path
          d="M34 52 C30 36 40 22 56 22 C62 18 74 20 80 28 C88 34 88 46 86 52 C84 44 80 40 76 40 C72 36 66 38 62 36 C56 38 50 36 46 40 C40 40 36 46 34 52 Z"
          fill={look.hair}
        />
      );
    case "side-part":
      return (
        <>
          <path d="M35 50 C34 32 46 23 60 23 C76 23 86 33 85 50 C83 42 78 37 72 36 L56 35 C48 36 40 40 35 50 Z" fill={look.hair} />
          <path d="M56 35 C54 30 55 26 58 24" stroke="#00000033" strokeWidth="1" fill="none" />
        </>
      );
    case "grey-receding":
      return (
        <>
          <path d="M36 56 C33 45 36 38 43 33 C40 42 40 49 41 57 Z" fill={look.hair} />
          <path d="M84 56 C87 45 84 38 77 33 C80 42 80 49 79 57 Z" fill={look.hair} />
          <path d="M44 32 C52 27 68 27 76 32 C68 30 52 30 44 32 Z" fill={look.hair} />
        </>
      );
    default:
      return (
        <path d="M35 49 C35 31 47 24 60 24 C74 24 86 31 85 49 C80 38 70 34 60 34 C50 34 40 38 35 49 Z" fill={look.hair} />
      );
  }
}

export function Face({ participantId, isSpeaking, isThinking = false, lookX = 0, className = "" }: FaceProps) {
  const look = PERSONA_LOOKS[participantId] ?? DEFAULT_LOOK;
  const mouthRef = useRef<SVGEllipseElement>(null);

  // Drive the mouth from live playback loudness, falling back to a natural
  // talking rhythm when no level is available (e.g. browser speech fallback).
  useEffect(() => {
    if (!isSpeaking) return;
    let frame = 0;
    let smoothed = 0;
    let silentSince = performance.now();
    const start = performance.now();

    const tick = (now: number) => {
      const measured = readOutputLevel();
      if (measured > 0.02) silentSince = now;
      const useSynthetic = now - silentSince > 350;
      const t = (now - start) / 1000;
      const synthetic = Math.max(
        0,
        0.45 + 0.35 * Math.sin(t * 13) * Math.sin(t * 3.1) + 0.15 * Math.sin(t * 29),
      );
      const target = useSynthetic ? synthetic : measured;
      smoothed += (target - smoothed) * 0.45;
      mouthRef.current?.setAttribute("ry", (0.8 + smoothed * 5.5).toFixed(2));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isSpeaking]);

  const gazeX = Math.max(-1, Math.min(1, lookX)) * 1.6;
  const gazeY = isThinking ? -1.6 : 0;

  return (
    <svg
      viewBox="0 0 120 130"
      aria-hidden="true"
      className={`${isSpeaking ? "face-talk" : ""} ${className}`}
    >
      <HairBack look={look} />

      {/* Body and neck */}
      <path d="M16 130 C19 101 37 91 52 88 L68 88 C83 91 101 101 104 130 Z" fill={look.outfit} />
      <path d="M52 88 L60 100 L68 88" fill="none" stroke="#f6f3ec" strokeOpacity="0.55" strokeWidth="2" />
      <rect x="52" y="74" width="16" height="15" rx="5" fill={look.skinShade} />

      {/* Ears and head */}
      <ellipse cx="36" cy="56" rx="4.2" ry="6.2" fill={look.skinShade} />
      <ellipse cx="84" cy="56" rx="4.2" ry="6.2" fill={look.skinShade} />
      <ellipse cx="60" cy="54" rx="24" ry="28" fill={look.skin} />

      <HairFront look={look} />

      {/* Beard sits under the mouth */}
      {look.beard && (
        <path
          d="M37 58 C39 79 50 86 60 86 C70 86 81 79 83 58 C79 72 71 79 60 79 C49 79 41 72 37 58 Z"
          fill={look.hair}
          opacity={look.beard === "full" ? 0.92 : 0.28}
        />
      )}

      {/* Eyebrows */}
      <path
        d={isThinking ? "M45 43 Q50 39 55 42" : "M45 45 Q50 42 55 45"}
        stroke={look.hair === "#b9b4ab" ? "#8d877c" : look.hair}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={isThinking ? "M65 42 Q70 39 75 43" : "M65 45 Q70 42 75 45"}
        stroke={look.hair === "#b9b4ab" ? "#8d877c" : look.hair}
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Eyes (blink + gaze) */}
      <g className="face-blink">
        <ellipse cx="50" cy="52" rx="3.6" ry="3.2" fill="#fbf9f4" />
        <ellipse cx="70" cy="52" rx="3.6" ry="3.2" fill="#fbf9f4" />
        <g style={{ transform: `translate(${gazeX}px, ${gazeY}px)`, transition: "transform 400ms ease" }}>
          <circle cx="50" cy="52.3" r="2.2" fill="#1a1a17" />
          <circle cx="70" cy="52.3" r="2.2" fill="#1a1a17" />
          <circle cx="50.8" cy="51.5" r="0.6" fill="#fbf9f4" />
          <circle cx="70.8" cy="51.5" r="0.6" fill="#fbf9f4" />
        </g>
      </g>

      {look.glasses && (
        <g fill="#fbf9f4" fillOpacity="0.12" stroke="#1a1a17" strokeWidth="1.5">
          <circle cx="50" cy="52" r="7" />
          <circle cx="70" cy="52" r="7" />
          <path d="M57 51.5 Q60 49.5 63 51.5" fill="none" />
        </g>
      )}

      {/* Nose */}
      <path d="M60 55 Q57 63 59.5 64.2 Q61.5 64.6 63 63.4" stroke={look.skinShade} strokeWidth="1.6" fill="none" strokeLinecap="round" />

      {look.moustache && <path d="M52 67 Q60 62.5 68 67 Q60 65.5 52 67 Z" fill={look.hair} />}

      {/* Mouth: open ellipse while speaking, gentle smile otherwise */}
      {isSpeaking ? (
        <ellipse ref={mouthRef} cx="60" cy="71" rx="5.4" ry="1" fill="#4a2019" stroke={look.lips} strokeWidth="1.4" />
      ) : (
        <path
          d={isThinking ? "M55 71 Q60 71.5 65 71" : "M53 69.5 Q60 74 67 69.5"}
          stroke={look.lips}
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {look.earrings && (
        <>
          <circle cx="36" cy="65" r="2" fill="#e3a13b" />
          <circle cx="84" cy="65" r="2" fill="#e3a13b" />
        </>
      )}
    </svg>
  );
}
