'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from '@/context/SessionContext';
import { ParticipantCard } from './ParticipantCard';
import { TranscriptView } from './TranscriptView';
import { CoachingNudgeArea } from './CoachingNudgeArea';
import { LiveCaptionsBar } from './LiveCaptionsBar';
import {
  Play,
  Pause,
  PhoneOff,
  FastForward,
  Subtitles,
  Send,
  Mic,
  MicOff,
  Clock,
  AlertCircle,
  Sparkles,
  RotateCcw,
  Bot,
  Zap,
  CornerDownRight,
  Volume2,
  VolumeX
} from 'lucide-react';

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
    turnCounts
  } = useSession();

  const [composerText, setComposerText] = useState('');

  const remainingSeconds = Math.max(0, state.totalDurationSeconds - state.elapsedSeconds);
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const student = state.participants.find((p) => p.role === 'student');
  const moderator = state.participants.find((p) => p.role === 'moderator');
  const aiParticipants = state.participants.filter((p) => p.role === 'ai_participant');

  const activeSpeaker =
    state.activeSpeakerId
      ? state.participants.find((p) => p.id === state.activeSpeakerId) || null
      : null;

  const generatingSpeaker = state.generatingSpeakerId
    ? state.participants.find((p) => p.id === state.generatingSpeakerId) || null
    : null;

  const handleSendMessage = (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!composerText.trim()) return;

    submitStudentTurn(composerText);
    setComposerText('');
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.code === 'Space' && state.activeSpeakerId && state.activeSpeakerId !== student?.id) {
        e.preventDefault();
        interruptCurrentSpeaker();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.activeSpeakerId, student?.id, interruptCurrentSpeaker]);

  // Phase badge styles
  const getPhaseBadge = () => {
    switch (state.phase) {
      case 'opening':
        return { label: 'Phase: Moderator Opening', color: 'bg-zinc-900 text-zinc-300 border-zinc-800' };
      case 'discussion':
        return { label: 'Phase: Open Discussion', color: 'bg-zinc-900 text-zinc-100 border-zinc-700' };
      case 'closing':
        return { label: 'Phase: Closing Round', color: 'bg-zinc-900 text-amber-300 border-zinc-800' };
      case 'completed':
        return { label: 'Phase: Session Completed', color: 'bg-zinc-900 text-zinc-400 border-zinc-800' };
      default:
        return { label: 'Phase: Initializing', color: 'bg-zinc-900 text-zinc-400 border-zinc-800' };
    }
  };

  const phaseBadge = getPhaseBadge();
  const isVoiceMode = state.interactionMode === 'voice';

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-100 flex flex-col justify-between">
      {/* Top Header Bar */}
      <header className="border-b border-[#27272a] bg-[#0c0c0e]/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Product & Topic Details */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-100 font-bold text-xs shrink-0">
              GD
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm sm:text-base text-white tracking-tight">
                  GD Arena
                </span>

                {/* Honest Engine Mode Badge */}
                {state.engineMode === 'ai' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 text-[11px] font-medium tracking-wide">
                    <Zap className="w-3 h-3 text-zinc-400" />
                    <span>AI Live (Groq + Gemini)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800 text-[11px] font-medium tracking-wide">
                    <Bot className="w-3 h-3 text-zinc-400" />
                    <span>Demo mode (Scripted Fallback)</span>
                  </span>
                )}

                {/* Interaction Mode Badge */}
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-zinc-900 text-zinc-300 border border-zinc-800 text-[11px] font-medium tracking-wide">
                  {isVoiceMode ? (
                    <>
                      <Mic className="w-3 h-3 text-zinc-300" />
                      <span>Voice Mode</span>
                    </>
                  ) : (
                    <span>Text Mode</span>
                  )}
                </span>

                <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${phaseBadge.color}`}>
                  {phaseBadge.label}
                </span>

                {state.isGenerating && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-zinc-300 bg-zinc-900 border border-zinc-800 px-2.5 py-0.5 rounded-full">
                    <Sparkles className="w-3 h-3 animate-spin text-zinc-400" />
                    <span>Thinking...</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 truncate max-w-md sm:max-w-xl mt-0.5 font-medium">
                Topic: &ldquo;{state.config.topic}&rdquo;
              </p>
            </div>
          </div>

          {/* Right: Timer & Primary Session Controls */}
          <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap">
            {/* Countdown Timer */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-mono text-sm ${
                remainingSeconds < 60
                  ? 'bg-red-950/40 text-red-300 border-red-800/60'
                  : 'bg-[#141417] text-zinc-200 border-[#27272a]'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-zinc-400" />
              <span className="font-semibold text-white">{timeFormatted}</span>
              {state.isPaused && (
                <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                  (Paused)
                </span>
              )}
            </div>

            {/* Mic Mute/Unmute Toggle in Voice Mode */}
            {isVoiceMode && (
              <button
                onClick={() => setMicMuted(!state.isMicMuted)}
                className={`p-2 rounded-xl border text-xs transition ${
                  state.isMicMuted
                    ? 'bg-red-950/50 text-red-300 border-red-800/60'
                    : 'bg-zinc-900 text-zinc-200 border-zinc-800 hover:bg-zinc-800'
                }`}
                title={state.isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {state.isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
            )}

            {/* Pause / Resume Button */}
            {state.isPaused ? (
              <button
                onClick={resumeSession}
                id="resume-discussion-btn"
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition"
                title="Resume discussion progression"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume</span>
              </button>
            ) : (
              <button
                onClick={pauseSession}
                id="pause-discussion-btn"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 text-xs font-medium transition"
                title="Pause discussion simulation and clock"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause</span>
              </button>
            )}

            {/* Jump to Closing — Demo Button */}
            {state.phase !== 'closing' && state.phase !== 'completed' && (
              <button
                onClick={jumpToClosing}
                id="jump-to-closing-btn"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-medium transition"
                title="Jump directly to closing round for testing"
              >
                <FastForward className="w-3.5 h-3.5 text-zinc-400" />
                <span className="hidden sm:inline">Jump to closing — demo</span>
                <span className="sm:hidden">Closing</span>
              </button>
            )}

            {/* Captions Visibility Toggle */}
            <button
              onClick={toggleCaptions}
              className={`p-2 rounded-xl border text-xs transition ${
                state.isCaptionsVisible
                  ? 'bg-zinc-800 text-white border-zinc-700'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
              }`}
              title={state.isCaptionsVisible ? 'Hide transcript pane' : 'Show transcript pane'}
            >
              <Subtitles className="w-4 h-4" />
            </button>

            {/* End Discussion Button */}
            <button
              onClick={endSession}
              id="end-discussion-btn"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-red-400 border border-zinc-800 hover:border-red-900/50 font-medium text-xs transition"
              title="Cancel pending turns and view session summary"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>End Discussion</span>
            </button>
          </div>
        </div>
      </header>

      {/* Audio Playback Autoplay Blocked Banner */}
      {state.isAudioBlocked && (
        <div className="bg-[#141417] border-b border-[#27272a] text-zinc-300 px-4 py-2.5 text-xs flex items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <VolumeX className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>Browser audio playback was blocked by autoplay policy. Click button to enable audio.</span>
          </div>
          <button
            onClick={unlockAudio}
            className="px-3 py-1 bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-lg text-xs transition flex items-center gap-1"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Enable Audio</span>
          </button>
        </div>
      )}

      {/* Recovered session banner */}
      {isRestoredSession && (
        <div className="bg-[#141417] border-b border-[#27272a] text-zinc-300 px-4 py-2 text-xs flex items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-zinc-400 shrink-0" />
            <span>
              Session recovered from localStorage. Currently paused. Click &quot;Resume&quot; above to continue simulation.
            </span>
          </div>
          <button
            onClick={resetSession}
            className="text-[11px] underline text-zinc-400 hover:text-white ml-4 shrink-0"
          >
            Reset Session
          </button>
        </div>
      )}

      {/* Actionable Error Banner if AI generation failed */}
      {state.errorState && (
        <div className="bg-[#181111] border-b border-red-900/40 text-red-200 px-4 py-3 text-xs sm:text-sm">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">AI Discussion Generation Alert</p>
                <p className="text-red-300 text-xs mt-0.5">{state.errorState.message}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={retryGeneration}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry Turn</span>
              </button>
              <button
                onClick={switchToDemoMode}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-800 rounded-lg text-xs transition flex items-center gap-1"
              >
                <Bot className="w-3 h-3 text-zinc-400" />
                <span>Switch to Demo Mode</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Entry Window Callout (when awaiting student opportunity) */}
      {state.awaitingStudentOpportunity && (
        <div className="bg-[#141417] border-b border-[#27272a] text-zinc-200 px-4 py-2 text-xs">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
              <span>
                <strong>Your turn to enter!</strong> The panel has paused after recent turns to give you speaking room. Speak into your mic or type below.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Area: Side-by-Side on Desktop, Stacked on Mobile */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Section: Panel Cards & Coaching Nudge (7 cols) */}
        <section className="lg:col-span-7 space-y-4">
          {/* Coaching Nudge Banner (Reserved area for Phase 4) */}
          <CoachingNudgeArea activeSpeaker={activeSpeaker} phase={state.phase} />

          {/* Moderator Card (Separate Card) */}
          {moderator && (
            <div>
              <ParticipantCard
                participant={moderator}
                isSpeaking={state.activeSpeakerId === moderator.id}
                isThinking={state.isGenerating && state.generatingSpeakerId === moderator.id}
                turnCount={turnCounts[moderator.id] || 0}
                isVoiceMode={isVoiceMode}
              />
            </div>
          )}

          {/* AI Participants Grid */}
          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Peer Debaters ({aiParticipants.length} Candidates)
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-zinc-400">
                  Mode: <span className="font-semibold text-zinc-200 uppercase">{state.engineMode}</span>
                </span>
                <span className="text-[11px] text-zinc-400">
                  • Patience: <span className="capitalize text-zinc-200 font-medium">{state.config.patience}</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {aiParticipants.map((p) => (
                <ParticipantCard
                  key={p.id}
                  participant={p}
                  isSpeaking={state.activeSpeakerId === p.id}
                  isThinking={state.isGenerating && state.generatingSpeakerId === p.id}
                  turnCount={turnCounts[p.id] || 0}
                  isVoiceMode={isVoiceMode}
                />
              ))}
            </div>
          </div>

          {/* Student Card ("You") */}
          {student && (
            <div>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Your Candidate Position
                </span>
                <span className="text-[11px] text-zinc-500">
                  {state.voiceFlowState === 'student_speaking'
                    ? 'Speaking now (mic active)'
                    : 'Ready to contribute'}
                </span>
              </div>
              <ParticipantCard
                participant={student}
                isSpeaking={state.activeSpeakerId === student.id}
                turnCount={turnCounts[student.id] || 0}
                isVoiceMode={isVoiceMode}
                isMicMuted={state.isMicMuted}
              />
            </div>
          )}
        </section>

        {/* Right Section: Live Transcript, Captions Bar & Composer (5 cols) */}
        <section className="lg:col-span-5 flex flex-col h-[650px] lg:h-[calc(100vh-140px)] lg:sticky lg:top-20 space-y-3">
          {/* Live Transcript Container */}
          <div className="flex-1 min-h-0">
            <TranscriptView
              transcript={state.transcript}
              participants={state.participants}
              activeSpeakerId={state.activeSpeakerId}
              isVisible={state.isCaptionsVisible}
              liveCaption={state.liveCaption}
              isGenerating={state.isGenerating}
              generatingSpeakerName={generatingSpeaker?.name || null}
            />
          </div>

          {/* Phase 3 Live Captions Bar (transient interim transcript) */}
          <LiveCaptionsBar
            liveCaption={state.liveCaption}
            flowState={state.voiceFlowState}
            activeSpeakerName={activeSpeaker?.name || null}
            onInterrupt={interruptCurrentSpeaker}
            isVoiceMode={isVoiceMode}
          />

          {/* Text Composer & Voice Controls */}
          <div className="p-3.5 rounded-2xl bg-[#141417] border border-[#27272a] space-y-2 shrink-0">
            {/* Status notice */}
            <div className="flex items-center justify-between text-[11px] text-zinc-400 px-1">
              <span className="flex items-center gap-1.5 text-zinc-400">
                {isVoiceMode ? (
                  <>
                    <Mic className="w-3.5 h-3.5 text-zinc-300 animate-pulse" />
                    <span>Live speech capture active. Speak anytime or type below.</span>
                  </>
                ) : (
                  <>
                    <MicOff className="w-3.5 h-3.5 text-zinc-500" />
                    <span>Text practice mode. Type below to participate.</span>
                  </>
                )}
              </span>

              {state.phase === 'closing' && !state.studentHasSpokenInClosing && (
                <button
                  type="button"
                  onClick={skipStudentClosing}
                  className="text-amber-400 hover:text-amber-300 underline text-[11px] flex items-center gap-0.5"
                >
                  <CornerDownRight className="w-3 h-3" />
                  <span>Skip my closing</span>
                </button>
              )}
            </div>

            {/* Composer Form */}
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                type="text"
                id="student-text-composer"
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder={
                  state.phase === 'closing'
                    ? 'Type your concluding summary here...'
                    : isVoiceMode
                    ? 'Speak into mic, or type your perspective here...'
                    : 'Share your perspective or challenge a point...'
                }
                disabled={state.phase === 'completed'}
                className="flex-1 rounded-xl bg-[#0c0c0e] border border-[#27272a] px-3.5 py-2.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
              />

              {/* Interrupt / Take Floor quick button */}
              {state.activeSpeakerId && state.activeSpeakerId !== student?.id && (
                <button
                  type="button"
                  onClick={interruptCurrentSpeaker}
                  className="px-3 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-zinc-800 text-xs font-semibold transition flex items-center gap-1 shrink-0"
                  title="Interrupt current speaker immediately"
                >
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Interrupt</span>
                </button>
              )}

              <button
                type="submit"
                id="send-student-turn-btn"
                disabled={!composerText.trim() || state.phase === 'completed'}
                className="px-4 py-2.5 rounded-xl bg-zinc-100 hover:bg-white disabled:opacity-40 disabled:hover:bg-zinc-100 text-zinc-950 font-bold text-xs transition flex items-center gap-1.5 shrink-0"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>

            <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1">
              <span>{isVoiceMode ? 'Mic VAD active • Press Enter to submit text' : 'Press Enter or Send to speak'}</span>
              <span>Candidate speech interrupts AI playback immediately</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
