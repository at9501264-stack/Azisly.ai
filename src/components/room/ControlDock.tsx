"use client";

import React, { useState } from "react";
import { FastForward, Hand, MessageSquareText, Pause, PhoneOff, Play, Send, Subtitles } from "lucide-react";
import { DiscussionPhase } from "@/types/session";

interface ControlDockProps {
  readonly phase: DiscussionPhase;
  readonly isPaused: boolean;
  readonly isVoiceMode: boolean;
  readonly canInterrupt: boolean;
  readonly canSkipClosing: boolean;
  readonly isCaptionsVisible: boolean;
  readonly isTranscriptOpen: boolean;
  readonly onSubmitText: (text: string) => void;
  readonly onInterrupt: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onJumpToClosing: () => void;
  readonly onSkipClosing: () => void;
  readonly onToggleCaptions: () => void;
  readonly onToggleTranscript: () => void;
  readonly onEnd: () => void;
}

const ICON_BUTTON =
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-colors";

export function ControlDock({
  phase,
  isPaused,
  isVoiceMode,
  canInterrupt,
  canSkipClosing,
  isCaptionsVisible,
  isTranscriptOpen,
  onSubmitText,
  onInterrupt,
  onPause,
  onResume,
  onJumpToClosing,
  onSkipClosing,
  onToggleCaptions,
  onToggleTranscript,
  onEnd,
}: ControlDockProps) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmitText(text);
    setText("");
  };

  const toggleClass = (on: boolean) =>
    on ? "border-forest bg-forest-soft text-forest" : "border-hair bg-card text-muted hover:text-ink";

  return (
    <div className="sticky bottom-0 z-30 border-t border-hair bg-paper/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-2 px-4 py-3 sm:flex-nowrap sm:px-6">
        {/* Session controls */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            id={isPaused ? "resume-discussion-btn" : "pause-discussion-btn"}
            onClick={isPaused ? onResume : onPause}
            title={isPaused ? "Resume" : "Pause"}
            aria-label={isPaused ? "Resume discussion" : "Pause discussion"}
            className={`${ICON_BUTTON} ${isPaused ? "border-forest bg-forest text-paper" : "border-hair bg-card text-ink hover:border-muted/40"}`}
          >
            {isPaused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
          </button>
          <button
            type="button"
            onClick={onToggleCaptions}
            aria-pressed={isCaptionsVisible}
            title="Subtitles"
            aria-label="Toggle subtitles"
            className={`${ICON_BUTTON} ${toggleClass(isCaptionsVisible)}`}
          >
            <Subtitles className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleTranscript}
            aria-pressed={isTranscriptOpen}
            title="Transcript"
            aria-label="Toggle transcript"
            className={`${ICON_BUTTON} ${toggleClass(isTranscriptOpen)}`}
          >
            <MessageSquareText className="h-4 w-4" />
          </button>
          {phase !== "closing" && phase !== "completed" && (
            <button
              type="button"
              id="jump-to-closing-btn"
              onClick={onJumpToClosing}
              title="Skip to closing round"
              aria-label="Skip to closing round"
              className={`${ICON_BUTTON} border-hair bg-card text-muted hover:text-ink`}
            >
              <FastForward className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Speak up / type */}
        <form onSubmit={handleSubmit} className="order-last flex w-full min-w-0 items-center gap-2 sm:order-none sm:flex-1">
          {canInterrupt && (
            <button
              type="button"
              onClick={onInterrupt}
              title="Interrupt and speak (Space)"
              className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-marigold px-4 text-sm font-semibold text-ink transition-colors hover:bg-[#d6942f]"
            >
              <Hand className="h-4 w-4" />
              <span className="hidden sm:inline">Interrupt</span>
              <kbd className="hidden rounded border border-ink/20 px-1.5 text-[10px] font-medium lg:inline">Space</kbd>
            </button>
          )}
          <label htmlFor="student-text-composer" className="sr-only">
            Your point
          </label>
          <input
            id="student-text-composer"
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={phase === "completed"}
            placeholder={
              phase === "closing"
                ? "Type your closing summary…"
                : isVoiceMode
                  ? "Speak, or type a point here…"
                  : "Type your point and press Enter…"
            }
            className="h-11 min-w-0 flex-1 rounded-lg border border-hair bg-card px-4 text-sm text-ink placeholder:text-muted/80 focus:border-forest focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            id="send-student-turn-btn"
            disabled={!text.trim() || phase === "completed"}
            aria-label="Send"
            className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-forest px-4 text-sm font-medium text-paper transition-colors hover:bg-forest-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Send</span>
          </button>
        </form>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          {canSkipClosing && (
            <button
              type="button"
              onClick={onSkipClosing}
              className="h-11 cursor-pointer rounded-lg border border-hair bg-card px-3 text-sm text-muted transition-colors hover:text-ink"
            >
              Skip<span className="hidden sm:inline"> my closing</span>
            </button>
          )}
          <button
            type="button"
            id="end-discussion-btn"
            onClick={onEnd}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-danger px-4 text-sm font-medium text-paper transition-opacity hover:opacity-90"
          >
            <PhoneOff className="h-4 w-4" />
            <span className="hidden sm:inline">End</span>
          </button>
        </div>
      </div>
    </div>
  );
}
