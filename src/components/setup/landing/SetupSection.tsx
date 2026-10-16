"use client";

import React, { useState } from "react";
import { AlertCircle, ArrowRight, Bot, Check, FileText, Mic, Sparkles } from "lucide-react";
import { PRESET_TOPICS } from "@/constants/topics";
import { MODERATOR, STUDENT_PARTICIPANT, getParticipantsForPanel } from "@/constants/participants";
import { AIPatience, EngineMode, InteractionMode, LanguagePreference, RoomConfig } from "@/types/session";
import { useSession } from "@/context/SessionContext";
import { PersonaAvatar } from "@/components/ui/PersonaAvatar";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { AudioPreflightModal } from "../AudioPreflightModal";

const PATIENCE_HINTS: Record<AIPatience, string> = {
  quick: "Fast GD. The panel jumps in after about 1.8s of silence.",
  balanced: "Standard rhythm. The panel waits about 2.8s.",
  patient: "Relaxed. The panel waits about 4s.",
};

const PANEL_HINTS: Record<3 | 4 | 5, string> = {
  3: "Aarav, Meera and Kabir.",
  4: "Adds Riya, the storyteller.",
  5: "Adds Dev, the consensus builder.",
};

function Step({
  number,
  title,
  action,
  children,
}: {
  readonly number: number;
  readonly title: string;
  readonly action?: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-xl border border-hair bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-forest text-xs font-semibold text-forest">
            {number}
          </span>
          <span className="font-serif text-xl font-semibold text-ink">{title}</span>
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChoiceCard({
  isActive,
  onSelect,
  icon: Icon,
  title,
  body,
  badge,
}: {
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly title: string;
  readonly body: string;
  readonly badge?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={onSelect}
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
        isActive ? "border-forest bg-forest-soft" : "border-hair bg-paper hover:border-muted/40"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
          isActive ? "bg-forest text-paper" : "bg-paper-2 text-muted"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">{title}</span>
          {badge && (
            <span className="rounded bg-marigold-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-1 block text-sm leading-relaxed text-muted">{body}</span>
      </span>
    </button>
  );
}

export function SetupSection() {
  const { state, startSession, isRestoredSession, resumeSession, resetSession } = useSession();

  const [selectedTopicId, setSelectedTopicId] = useState<string>(PRESET_TOPICS[0].id);
  const [isCustomTopicMode, setIsCustomTopicMode] = useState(false);
  const [customTopicInput, setCustomTopicInput] = useState("");
  const [customTopicError, setCustomTopicError] = useState("");

  const [participantCount, setParticipantCount] = useState<3 | 4 | 5>(3);
  const [language, setLanguage] = useState<LanguagePreference>("english");
  const [durationMinutes, setDurationMinutes] = useState<5 | 8 | 10>(5);
  const [patience, setPatience] = useState<AIPatience>("balanced");
  const [enginePreference, setEnginePreference] = useState<EngineMode>(
    state.isAiConfigured === false ? "demo" : "ai",
  );
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("voice");
  const [isPreflightModalOpen, setIsPreflightModalOpen] = useState(false);

  const selectedPreset = PRESET_TOPICS.find((t) => t.id === selectedTopicId) || PRESET_TOPICS[0];
  const activeTopicTitle = isCustomTopicMode ? customTopicInput.trim() : selectedPreset.title;
  const activeParticipants = getParticipantsForPanel(participantCount);

  const buildRoomConfig = (mode: InteractionMode): RoomConfig => ({
    topic: activeTopicTitle,
    isCustomTopic: isCustomTopicMode,
    participantCount,
    language,
    durationMinutes,
    patience,
    preferredEngine: enginePreference,
    mode,
  });

  const handleStart = (e: React.SyntheticEvent) => {
    e.preventDefault();

    if (isCustomTopicMode) {
      const trimmed = customTopicInput.trim();
      if (!trimmed) {
        setCustomTopicError("Please enter a topic before starting.");
        return;
      }
      if (trimmed.length < 5) {
        setCustomTopicError("Topic is too short (minimum 5 characters).");
        return;
      }
      setCustomTopicError("");
    }

    if (interactionMode === "voice") {
      setIsPreflightModalOpen(true);
    } else {
      startSession(buildRoomConfig("text"));
    }
  };

  const summaryRows = [
    { label: "Mode", value: interactionMode === "voice" ? "Voice" : "Text" },
    { label: "Panel", value: `${participantCount} peers + moderator` },
    { label: "Length", value: `${durationMinutes} minutes` },
    { label: "Language", value: language === "english" ? "English" : "Hinglish" },
    { label: "Pace", value: patience.charAt(0).toUpperCase() + patience.slice(1) },
    { label: "Engine", value: enginePreference === "ai" ? "Live AI" : "Demo" },
  ];

  return (
    <section id="setup" className="scroll-mt-16 py-16 lg:py-20">
      <AudioPreflightModal
        isOpen={isPreflightModalOpen}
        onClose={() => setIsPreflightModalOpen(false)}
        onConfirmVoiceMode={() => {
          setIsPreflightModalOpen(false);
          startSession(buildRoomConfig("voice"));
        }}
        onSwitchToTextMode={() => {
          setIsPreflightModalOpen(false);
          setInteractionMode("text");
          startSession(buildRoomConfig("text"));
        }}
      />

      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        {isRestoredSession && state.phase !== "setup" && (
          <div className="mb-8 flex flex-col items-start justify-between gap-3 rounded-xl border border-hair bg-card p-4 text-sm sm:flex-row sm:items-center">
            <span className="text-ink">
              You have an unfinished session on &ldquo;<strong>{state.config.topic}</strong>&rdquo;.
            </span>
            <div className="flex gap-2">
              <button type="button" onClick={resumeSession} className="cursor-pointer rounded-lg bg-forest px-4 py-2 text-sm font-medium text-paper">
                Resume
              </button>
              <button type="button" onClick={resetSession} className="cursor-pointer rounded-lg border border-hair px-4 py-2 text-sm font-medium text-ink">
                Start fresh
              </button>
            </div>
          </div>
        )}

        <h2 className="font-serif text-[clamp(2rem,3.4vw,2.75rem)] font-semibold leading-tight tracking-[-0.01em] text-ink">
          Set up your room
        </h2>
        <p className="mt-3 max-w-xl text-base text-muted">
          Four quick choices. The defaults work well for a first round.
        </p>

        <form onSubmit={handleStart} className="mt-10 grid grid-cols-1 items-start gap-6 lg:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
          <div className="space-y-5">
            {/* 1. Topic */}
            <Step
              number={1}
              title="Topic"
              action={
                <div className="w-48">
                  <SegmentedControl
                    label="Topic source"
                    value={isCustomTopicMode ? "custom" : "preset"}
                    onChange={(v) => {
                      setIsCustomTopicMode(v === "custom");
                      setCustomTopicError("");
                    }}
                    options={[
                      { value: "preset", label: "Choose" },
                      { value: "custom", label: "Write" },
                    ]}
                  />
                </div>
              }
            >
              {!isCustomTopicMode ? (
                <div role="radiogroup" aria-label="Discussion topic" className="divide-y divide-hair overflow-hidden rounded-lg border border-hair bg-paper">
                  {PRESET_TOPICS.map((topic) => {
                    const isSelected = selectedTopicId === topic.id;
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setSelectedTopicId(topic.id)}
                        className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left transition-colors ${
                          isSelected ? "bg-forest-soft" : "hover:bg-paper-2"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                            isSelected ? "border-forest bg-forest text-paper" : "border-muted/50"
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[15px] font-medium leading-snug text-ink">{topic.title}</span>
                          <span className="mt-0.5 block text-xs text-muted">{topic.category}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div>
                  <label htmlFor="custom-topic" className="sr-only">
                    Custom topic
                  </label>
                  <textarea
                    id="custom-topic"
                    value={customTopicInput}
                    onChange={(e) => {
                      setCustomTopicInput(e.target.value);
                      if (customTopicError) setCustomTopicError("");
                    }}
                    placeholder="e.g. Is remote work reducing long-term innovation in tech startups?"
                    rows={3}
                    className="w-full resize-none rounded-lg border border-hair bg-paper p-4 text-[15px] text-ink placeholder:text-muted/70 focus:border-forest focus:outline-none"
                  />
                  {customTopicError ? (
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-danger">
                      <AlertCircle className="h-4 w-4" />
                      {customTopicError}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-muted">Tip: frame it as a trade-off to get a lively debate.</p>
                  )}
                </div>
              )}
            </Step>

            {/* 2. Mode */}
            <Step number={2} title="How you'll take part">
              <div role="radiogroup" aria-label="Practice mode" className="grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  isActive={interactionMode === "voice"}
                  onSelect={() => setInteractionMode("voice")}
                  icon={Mic}
                  title="Speak"
                  badge="Recommended"
                  body="Use your microphone and hear the panel's voices."
                />
                <ChoiceCard
                  isActive={interactionMode === "text"}
                  onSelect={() => setInteractionMode("text")}
                  icon={FileText}
                  title="Type"
                  body="Read each turn and type your points."
                />
              </div>
            </Step>

            {/* 3. Format */}
            <Step number={3} title="Format">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">AI peers</p>
                  <SegmentedControl
                    label="AI peers"
                    value={participantCount}
                    onChange={setParticipantCount}
                    options={[
                      { value: 3, label: "3" },
                      { value: 4, label: "4" },
                      { value: 5, label: "5" },
                    ]}
                  />
                  <p className="mt-2 text-xs text-muted">{PANEL_HINTS[participantCount]}</p>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">Language</p>
                  <SegmentedControl
                    label="Language"
                    value={language}
                    onChange={setLanguage}
                    options={[
                      { value: "english", label: "English" },
                      { value: "hinglish", label: "Hinglish" },
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">Length</p>
                  <SegmentedControl
                    label="Length"
                    value={durationMinutes}
                    onChange={setDurationMinutes}
                    options={[
                      { value: 5, label: "5 min" },
                      { value: 8, label: "8 min" },
                      { value: 10, label: "10 min" },
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-ink">Pace</p>
                  <SegmentedControl
                    label="Pace"
                    value={patience}
                    onChange={setPatience}
                    options={[
                      { value: "quick", label: "Quick" },
                      { value: "balanced", label: "Balanced" },
                      { value: "patient", label: "Patient" },
                    ]}
                  />
                  <p className="mt-2 text-xs text-muted">{PATIENCE_HINTS[patience]}</p>
                </div>
              </div>
            </Step>

            {/* 4. Engine */}
            <Step number={4} title="Panel engine">
              <div role="radiogroup" aria-label="Panel engine" className="grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  isActive={enginePreference === "ai"}
                  onSelect={() => setEnginePreference("ai")}
                  icon={Sparkles}
                  title="Live AI"
                  body="Peers respond to what you actually say."
                />
                <ChoiceCard
                  isActive={enginePreference === "demo"}
                  onSelect={() => setEnginePreference("demo")}
                  icon={Bot}
                  title="Demo"
                  body="Scripted dialogue. Works offline."
                />
              </div>
              {state.isAiConfigured === false && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Live AI is unavailable right now, so the demo panel will be used.
                </p>
              )}
            </Step>
          </div>

          {/* Summary */}
          <aside className="rounded-xl bg-forest p-6 text-paper lg:sticky lg:top-24">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-on-forest-muted">Your room</p>

            <div className="mt-4 flex items-center gap-1.5">
              {[MODERATOR, ...activeParticipants, STUDENT_PARTICIPANT].map((p) => (
                <PersonaAvatar key={p.id} participant={p} size="sm" outlineColor="rgba(246, 243, 236, 0.45)" />
              ))}
            </div>

            <p className="mt-6 text-xs font-medium uppercase tracking-[0.12em] text-on-forest-muted">Topic</p>
            <p className="mt-1.5 font-serif text-xl font-semibold leading-snug">
              {activeTopicTitle || <span className="text-on-forest-muted">Write your topic…</span>}
            </p>

            <dl className="mt-6 divide-y divide-white/10 border-y border-white/10">
              {summaryRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between py-2.5 text-sm">
                  <dt className="text-on-forest-muted">{row.label}</dt>
                  <dd className="m-0 font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>

            <button
              type="submit"
              id="enter-practice-room-btn"
              className="mt-6 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-marigold px-6 text-base font-semibold text-ink transition-colors hover:bg-[#d6942f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold"
            >
              {interactionMode === "voice" ? (
                <>
                  <Mic className="h-4 w-4" />
                  Check mic &amp; enter
                </>
              ) : (
                <>
                  Enter the room
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            <p className="mt-3 text-center text-xs text-on-forest-muted">
              {interactionMode === "voice"
                ? "We'll test your microphone first."
                : "No microphone needed."}
            </p>
          </aside>
        </form>
      </div>
    </section>
  );
}
