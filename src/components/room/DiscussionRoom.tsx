"use client";

import React, { useEffect, useState } from "react";
import { AlertCircle, Bot, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { getPersonaColor } from "@/constants/personaColors";
import { RoomHeader } from "./RoomHeader";
import { RoomStage } from "./RoomStage";
import { ControlDock } from "./ControlDock";
import { TranscriptView } from "./TranscriptView";
import { CoachingNudgeArea } from "./CoachingNudgeArea";

function Banner({
  tone,
  icon: Icon,
  children,
  actions,
}: {
  readonly tone: "info" | "danger";
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly children: React.ReactNode;
  readonly actions?: React.ReactNode;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${
        tone === "danger" ? "border-danger/25 bg-[#f3ddd8]/60 text-ink" : "border-hair bg-card text-ink"
      }`}
    >
      <span className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone === "danger" ? "text-danger" : "text-forest"}`} />
        <span>{children}</span>
      </span>
      {actions && <span className="flex shrink-0 gap-2">{actions}</span>}
    </div>
  );
}

export function DiscussionRoom() {
  const {
    state,
    isRestoredSession,
    pauseSession,
    resumeSession,
    endSession,
    resetSession,
    jumpToClosing,
    submitStudentTurn,
    skipStudentClosing,
    toggleCaptions,
    switchToDemoMode,
    retryGeneration,
    interruptCurrentSpeaker,
    setMicMuted,
    unlockAudio,
    voiceNotice,
  } = useSession();

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(true);

  const remainingSeconds = Math.max(0, state.totalDurationSeconds - state.elapsedSeconds);
  const student = state.participants.find((p) => p.role === "student");
  const moderator = state.participants.find((p) => p.role === "moderator");
  const peers = state.participants.filter((p) => p.role === "ai_participant");
  const isVoiceMode = state.interactionMode === "voice";

  const activeSpeaker = state.activeSpeakerId
    ? state.participants.find((p) => p.id === state.activeSpeakerId) || null
    : null;
  const generatingSpeaker = state.generatingSpeakerId
    ? state.participants.find((p) => p.id === state.generatingSpeakerId) || null
    : null;

  const isStudentSpeaking =
    state.voiceFlowState === "student_speaking" ||
    Boolean(state.liveCaption) ||
    (student !== undefined && state.activeSpeakerId === student.id);
  const isAiSpeaking = Boolean(activeSpeaker && activeSpeaker.role !== "student");
  // Panel is talking or about to: offer the interrupt
  const isPanelSpeaking = isAiSpeaking || state.isGenerating;

  // Space bar takes the floor from whoever is speaking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      const panelBusy =
        (state.activeSpeakerId && state.activeSpeakerId !== student?.id) || state.isGenerating;
      if (e.code === "Space" && panelBusy) {
        e.preventDefault();
        interruptCurrentSpeaker();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.activeSpeakerId, state.isGenerating, student?.id, interruptCurrentSpeaker]);

  // Subtitle line: what is being said right now
  let subtitle: { name: string; text: string | null; color: string } | null = null;
  if (state.liveCaption) {
    subtitle = { name: "You", text: state.liveCaption, color: getPersonaColor("student-you").hex };
  } else if (activeSpeaker) {
    const lastTurn = state.transcript[state.transcript.length - 1];
    const isTheirLine = lastTurn?.speakerId === activeSpeaker.id;
    subtitle = {
      name: activeSpeaker.role === "student" ? "You" : activeSpeaker.name,
      text: isTheirLine ? lastTurn.text : null,
      color: getPersonaColor(activeSpeaker.id).hex,
    };
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper font-body text-ink selection:bg-marigold-soft">
      <RoomHeader
        phase={state.phase}
        remainingSeconds={remainingSeconds}
        isPaused={state.isPaused}
        engineMode={state.engineMode}
      />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6">
        <div className="mb-4 space-y-3 empty:mb-0">
          {state.isAudioBlocked && (
            <Banner
              tone="info"
              icon={VolumeX}
              actions={
                <button type="button" onClick={unlockAudio} className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-forest px-3 py-1.5 text-sm font-medium text-paper">
                  <Volume2 className="h-4 w-4" />
                  Turn on sound
                </button>
              }
            >
              Your browser blocked the panel&apos;s audio. Turn sound on to hear them.
            </Banner>
          )}

          {voiceNotice && isVoiceMode && (
            <Banner tone="info" icon={Volume2}>
              {voiceNotice}
            </Banner>
          )}

          {isRestoredSession && (
            <Banner
              tone="info"
              icon={AlertCircle}
              actions={
                <button type="button" onClick={resetSession} className="cursor-pointer rounded-lg border border-hair px-3 py-1.5 text-sm font-medium">
                  Start over
                </button>
              }
            >
              We restored your last session. It&apos;s paused; press play below to continue.
            </Banner>
          )}

          {state.errorState && (
            <Banner
              tone="danger"
              icon={AlertCircle}
              actions={
                <>
                  <button type="button" onClick={retryGeneration} className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-forest px-3 py-1.5 text-sm font-medium text-paper">
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                  <button type="button" onClick={switchToDemoMode} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-hair bg-card px-3 py-1.5 text-sm font-medium">
                    <Bot className="h-3.5 w-3.5" />
                    Use demo panel
                  </button>
                </>
              }
            >
              {state.errorState.message}
            </Banner>
          )}
        </div>

        <div className={`grid grid-cols-1 gap-5 ${isTranscriptOpen ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
          <div className="min-w-0">
            <RoomStage
              topic={state.config.topic}
              phase={state.phase}
              moderator={moderator}
              peers={peers}
              activeSpeakerId={state.activeSpeakerId}
              generatingSpeakerId={state.generatingSpeakerId}
              isGenerating={state.isGenerating}
              isVoiceMode={isVoiceMode}
              isMicMuted={state.isMicMuted}
              isStudentSpeaking={isStudentSpeaking}
              hasTheFloor={state.awaitingStudentOpportunity}
              isPanelSpeaking={isPanelSpeaking}
              onToggleMute={() => setMicMuted(!state.isMicMuted)}
            />

            {/* Subtitles */}
            {state.isCaptionsVisible && (
              <div className="mt-4 flex min-h-[3.5rem] items-center rounded-xl bg-ink px-5 py-3 text-paper" aria-live="polite">
                {subtitle ? (
                  <p className="line-clamp-2 text-[15px] leading-relaxed">
                    <span className="mr-2 font-semibold" style={{ color: subtitle.color === "#1e3a2f" ? "#b9c4bc" : subtitle.color }}>
                      {subtitle.name}{subtitle.text ? ":" : ""}
                    </span>
                    {subtitle.text ?? <span className="italic text-paper/60">{subtitle.name === "You" ? "are" : "is"} speaking…</span>}
                  </p>
                ) : (
                  <p className="text-sm text-paper/60">
                    {state.isGenerating && generatingSpeaker
                      ? `${generatingSpeaker.name} is about to speak…`
                      : isVoiceMode
                        ? "Silence. Jump in whenever you're ready."
                        : "Type a point below to join in."}
                  </p>
                )}
              </div>
            )}
          </div>

          {isTranscriptOpen && (
            <aside className="flex h-[480px] min-h-0 flex-col overflow-hidden rounded-xl border border-hair bg-card xl:sticky xl:top-20 xl:h-[calc(100vh-180px)]">
              <CoachingNudgeArea activeSpeaker={activeSpeaker} phase={state.phase} />
              <TranscriptView
                transcript={state.transcript}
                participants={state.participants}
                activeSpeakerId={state.activeSpeakerId}
                liveCaption={state.liveCaption}
                isGenerating={state.isGenerating}
                generatingSpeakerName={generatingSpeaker?.name || null}
              />
            </aside>
          )}
        </div>
      </main>

      <ControlDock
        phase={state.phase}
        isPaused={state.isPaused}
        isVoiceMode={isVoiceMode}
        canInterrupt={isPanelSpeaking}
        canSkipClosing={state.phase === "closing" && !state.studentHasSpokenInClosing}
        isCaptionsVisible={state.isCaptionsVisible}
        isTranscriptOpen={isTranscriptOpen}
        onSubmitText={submitStudentTurn}
        onInterrupt={interruptCurrentSpeaker}
        onPause={pauseSession}
        onResume={resumeSession}
        onJumpToClosing={jumpToClosing}
        onSkipClosing={skipStudentClosing}
        onToggleCaptions={toggleCaptions}
        onToggleTranscript={() => setIsTranscriptOpen((open) => !open)}
        onEnd={endSession}
      />
    </div>
  );
}
