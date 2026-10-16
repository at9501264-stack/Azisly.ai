"use client";

import React, { useEffect, useRef } from "react";
import { Keyboard, Mic, MicOff } from "lucide-react";
import { readInputLevel } from "@/services/audio/audioLevelMeter";

interface StudentSeatProps {
  readonly isVoiceMode: boolean;
  readonly isMicMuted: boolean;
  readonly isSpeaking: boolean;
  readonly hasTheFloor: boolean;
  /** Someone on the panel is speaking or about to speak */
  readonly isPanelSpeaking: boolean;
  readonly onToggleMute: () => void;
}

export function StudentSeat({
  isVoiceMode,
  isMicMuted,
  isSpeaking,
  hasTheFloor,
  isPanelSpeaking,
  onToggleMute,
}: StudentSeatProps) {
  const ringRef = useRef<HTMLSpanElement>(null);
  const isLive = isVoiceMode && !isMicMuted;

  // Grow the ring around the mic with your live input level
  useEffect(() => {
    if (!isLive) return;
    let frame = 0;
    let smoothed = 0;
    const tick = () => {
      smoothed += (readInputLevel() - smoothed) * 0.35;
      if (ringRef.current) {
        ringRef.current.style.transform = `scale(${1 + smoothed * 0.55})`;
        ringRef.current.style.opacity = String(0.25 + smoothed * 0.75);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isLive]);

  let statusText = "Type your points below";
  let buttonLabel = "Type your points below";
  if (isVoiceMode) {
    if (isMicMuted && isPanelSpeaking) {
      statusText = "Tap to interrupt & speak";
      buttonLabel = "Interrupt and speak";
    } else if (isMicMuted) {
      statusText = "Mic off · tap to speak";
      buttonLabel = "Turn on microphone to speak";
    } else if (isSpeaking) {
      statusText = "You're speaking… tap when done";
      buttonLabel = "Turn off microphone and send";
    } else {
      statusText = "Listening… tap when done";
      buttonLabel = "Turn off microphone";
    }
  }

  let badge: string | null = null;
  if (isVoiceMode && !isMicMuted) badge = "You have the floor";
  else if (hasTheFloor) badge = isVoiceMode ? "Your turn · tap the mic" : "Your turn · type below";

  return (
    <div className="relative flex flex-col items-center text-center">
      {badge && (
        <span className="absolute -top-9 animate-fade-up whitespace-nowrap rounded-full bg-marigold px-3 py-1 text-xs font-semibold text-ink shadow-sm">
          {badge}
        </span>
      )}

      {isVoiceMode ? (
        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={!isMicMuted}
          aria-label={buttonLabel}
          title={buttonLabel}
          className="relative flex h-20 w-20 cursor-pointer items-center justify-center rounded-full lg:h-24 lg:w-24"
        >
          {isLive && (
            <span
              ref={ringRef}
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-marigold transition-transform duration-75"
            />
          )}
          <span
            className={`relative flex h-full w-full items-center justify-center rounded-full border-4 transition-colors ${
              isMicMuted
                ? hasTheFloor || isPanelSpeaking
                  ? "border-marigold bg-card text-forest"
                  : "border-hair bg-card text-muted"
                : "border-marigold bg-forest text-paper"
            }`}
          >
            {isMicMuted ? <MicOff className="h-8 w-8" /> : <Mic className="h-8 w-8" />}
          </span>
        </button>
      ) : (
        <span className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-card bg-forest text-paper lg:h-24 lg:w-24">
          <Keyboard className="h-8 w-8" />
        </span>
      )}

      <span className="mt-2 rounded-lg border border-hair bg-card px-3 py-1.5 text-sm font-semibold text-ink shadow-[0_1px_2px_rgba(26,26,23,0.05)]">
        You
      </span>
      <span className={`mt-1 text-xs ${isVoiceMode && !isMicMuted ? "font-medium text-forest" : "text-muted"}`}>{statusText}</span>
    </div>
  );
}
