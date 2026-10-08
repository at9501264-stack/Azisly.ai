'use client';

import React, { useState } from 'react';
import { PRESET_TOPICS } from '@/constants/topics';
import {
  MODERATOR,
  STUDENT_PARTICIPANT,
  getParticipantsForPanel
} from '@/constants/participants';
import {
  RoomConfig,
  LanguagePreference,
  AIPatience,
  EngineMode,
  InteractionMode
} from '@/types/session';
import { useSession } from '@/context/SessionContext';
import { AudioPreflightModal } from './AudioPreflightModal';
import {
  Users,
  Clock,
  Globe2,
  Sparkles,
  ArrowRight,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  CheckCircle2,
  Zap,
  Bot,
  Mic,
  FileText,
  Volume2
} from 'lucide-react';

export function RoomSetup() {
  const { state, startSession, isRestoredSession, resumeSession, resetSession } = useSession();

  const [selectedTopicId, setSelectedTopicId] = useState<string>(PRESET_TOPICS[0].id);
  const [isCustomTopicMode, setIsCustomTopicMode] = useState<boolean>(false);
  const [customTopicInput, setCustomTopicInput] = useState<string>('');
  const [customTopicError, setCustomTopicError] = useState<string>('');

  const [participantCount, setParticipantCount] = useState<3 | 4 | 5>(3);
  const [language, setLanguage] = useState<LanguagePreference>('english');
  const [durationMinutes, setDurationMinutes] = useState<5 | 8 | 10>(5);
  const [patience, setPatience] = useState<AIPatience>('balanced');
  const [enginePreference, setEnginePreference] = useState<EngineMode>(
    state.isAiConfigured === false ? 'demo' : 'ai'
  );
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('voice');
  const [isPreflightModalOpen, setIsPreflightModalOpen] = useState<boolean>(false);

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
    mode
  });

  const handleStart = (e: React.SyntheticEvent) => {
    e.preventDefault();

    if (isCustomTopicMode) {
      const trimmed = customTopicInput.trim();
      if (!trimmed) {
        setCustomTopicError('Please enter a valid topic name before proceeding.');
        return;
      }
      if (trimmed.length < 5) {
        setCustomTopicError('Topic description is too short (minimum 5 characters).');
        return;
      }
      setCustomTopicError('');
    }

    if (interactionMode === 'voice') {
      setIsPreflightModalOpen(true);
    } else {
      startSession(buildRoomConfig('text'));
    }
  };

  return (
    <div className="min-h-screen bg-[#080d1a] text-slate-100 flex flex-col justify-between">
      {/* Audio Preflight Modal */}
      <AudioPreflightModal
        isOpen={isPreflightModalOpen}
        onClose={() => setIsPreflightModalOpen(false)}
        onConfirmVoiceMode={() => {
          setIsPreflightModalOpen(false);
          startSession(buildRoomConfig('voice'));
        }}
        onSwitchToTextMode={() => {
          setIsPreflightModalOpen(false);
          setInteractionMode('text');
          startSession(buildRoomConfig('text'));
        }}
      />

      {/* Top Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-[#0b1222]/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 font-bold tracking-wider text-base">
              GD
            </div>
            <div>
              <span className="font-semibold text-lg tracking-tight text-white">
                GD Arena
              </span>
              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded bg-teal-500/10 text-teal-300 border border-teal-500/20">
                Phase 3 Voice Arena
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>AI Voice & Speech Ready</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full">
        {/* Recovered Session Alert Banner */}
        {isRestoredSession && state.phase !== 'setup' && (
          <div className="mb-6 p-4 rounded-xl bg-teal-950/60 border border-teal-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
              <span>
                Found an active previous practice session on topic &ldquo;
                <strong>{state.config.topic}</strong>&rdquo; (Phase: {state.phase}).
              </span>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={resumeSession}
                className="px-3.5 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-xs transition"
              >
                Resume session
              </button>
              <button
                type="button"
                onClick={resetSession}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition border border-slate-700"
              >
                Start fresh
              </button>
            </div>
          </div>
        )}

        {/* Intro Hero Section */}
        <div className="mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>Realistic Voice Placement GD Simulator</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Configure Your Practice Discussion
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
            Practice campus placement group discussions with 3 to 5 distinct AI debaters plus a faculty moderator.
            Speak with live voice, listen to distinct personas, and practice real-time interjections.
          </p>
        </div>

        {/* Setup Form Grid */}
        <form onSubmit={handleStart} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Topic, Modes, & Settings (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Topic Selection Card */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#0d1527] border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>1. Discussion Topic</span>
                  <span className="text-xs font-normal text-slate-400">(Curated campus topics)</span>
                </label>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomTopicMode(false);
                      setCustomTopicError('');
                    }}
                    className={`px-3 py-1 rounded-lg border transition ${
                      !isCustomTopicMode
                        ? 'bg-teal-500/20 text-teal-300 border-teal-500/60 font-semibold'
                        : 'bg-[#111a2f] text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Presets
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCustomTopicMode(true)}
                    className={`px-3 py-1 rounded-lg border transition ${
                      isCustomTopicMode
                        ? 'bg-teal-500/20 text-teal-300 border-teal-500/60 font-semibold'
                        : 'bg-[#111a2f] text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Custom Topic
                  </button>
                </div>
              </div>

              {!isCustomTopicMode ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2 max-h-[280px] overflow-y-auto pr-1">
                    {PRESET_TOPICS.map((topic) => {
                      const isSelected = selectedTopicId === topic.id;
                      return (
                        <button
                          key={topic.id}
                          type="button"
                          onClick={() => setSelectedTopicId(topic.id)}
                          className={`w-full text-left p-3 rounded-xl border transition flex items-start justify-between gap-3 ${
                            isSelected
                              ? 'bg-teal-950/40 border-teal-500/60 text-white ring-1 ring-teal-500/40'
                              : 'bg-[#111a2f] border-slate-800/90 hover:border-slate-700 text-slate-300'
                          }`}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${
                                  isSelected
                                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                                    : 'bg-slate-800 text-slate-400 border-slate-700/60'
                                }`}
                              >
                                {topic.category}
                              </span>
                              <span className="text-xs font-semibold truncate text-slate-100">
                                {topic.title}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-1">{topic.contextBrief}</p>
                          </div>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0 mt-1.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={customTopicInput}
                    onChange={(e) => {
                      setCustomTopicInput(e.target.value);
                      if (customTopicError) setCustomTopicError('');
                    }}
                    placeholder="e.g. Is remote work reducing long-term innovation in tech startups?"
                    rows={3}
                    className="w-full bg-[#111a2f] border border-slate-700 rounded-xl p-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                  />
                  {customTopicError && (
                    <p className="text-xs text-rose-400 flex items-center gap-1 mt-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{customTopicError}</span>
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">
                    Pro-tip: Frame topics as contentious trade-offs to trigger spirited debate.
                  </p>
                </div>
              )}
            </div>

            {/* Interaction Mode Card: Voice vs Text */}
            <div className="p-5 sm:p-6 rounded-2xl bg-[#0d1527] border border-slate-800 space-y-3">
              <label className="text-sm font-semibold text-white flex items-center gap-2">
                <Mic className="w-4 h-4 text-teal-400" />
                <span>2. Practice Interaction Mode</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setInteractionMode('voice')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col gap-1.5 ${
                    interactionMode === 'voice'
                      ? 'bg-teal-950/40 border-teal-500/60 ring-1 ring-teal-500/40'
                      : 'bg-[#111a2f] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-teal-400" />
                      <span>Voice Mode (Recommended)</span>
                    </span>
                    {interactionMode === 'voice' && (
                      <span className="text-[10px] text-teal-400 font-bold px-1.5 py-0.5 rounded bg-teal-500/10 border border-teal-500/30">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Speak aloud with microphone, hear Sarvam AI debater voices, and test instant speech interruptions.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setInteractionMode('text')}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col gap-1.5 ${
                    interactionMode === 'text'
                      ? 'bg-teal-950/40 border-teal-500/60 ring-1 ring-teal-500/40'
                      : 'bg-[#111a2f] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>Text-Only Mode</span>
                    </span>
                    {interactionMode === 'text' && (
                      <span className="text-[10px] text-teal-400 font-bold px-1.5 py-0.5 rounded bg-teal-500/10 border border-teal-500/30">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Read simulated turns on screen and submit text interjections via the composer keyboard.
                  </p>
                </button>
              </div>
            </div>

            {/* Panel Size & Format Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Panel Size */}
              <div className="p-4 rounded-xl bg-[#0d1527] border border-slate-800">
                <label className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-teal-400" />
                  AI Debaters in Panel
                </label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {([3, 4, 5] as const).map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setParticipantCount(cnt)}
                      className={`py-2 px-3 text-xs font-medium rounded-lg border transition ${
                        participantCount === cnt
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/60'
                          : 'bg-[#111a2f] text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {cnt} AI Peers
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  {participantCount === 3 && 'Aarav, Meera, Kabir (+ Moderator & You)'}
                  {participantCount === 4 && 'Adds Riya (Creative/Tangential)'}
                  {participantCount === 5 && 'Adds Dev (Synthesizer & Diplomat)'}
                </p>
              </div>

              {/* Language Preference */}
              <div className="p-4 rounded-xl bg-[#0d1527] border border-slate-800">
                <label className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Globe2 className="w-3.5 h-3.5 text-teal-400" />
                  Discussion Language
                </label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setLanguage('english')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border transition ${
                      language === 'english'
                        ? 'bg-teal-500/20 text-teal-300 border-teal-500/60'
                        : 'bg-[#111a2f] text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage('hinglish')}
                    className={`py-2 px-3 text-xs font-medium rounded-lg border transition ${
                      language === 'hinglish'
                        ? 'bg-teal-500/20 text-teal-300 border-teal-500/60'
                        : 'bg-[#111a2f] text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    Hindi-English
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  {language === 'english' ? 'Standard corporate placement English' : 'Natural Hinglish code-switching'}
                </p>
              </div>

              {/* Duration Setting */}
              <div className="p-4 rounded-xl bg-[#0d1527] border border-slate-800">
                <label className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-teal-400" />
                  Session Duration
                </label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {([5, 8, 10] as const).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setDurationMinutes(mins)}
                      className={`py-2 px-3 text-xs font-medium rounded-lg border transition ${
                        durationMinutes === mins
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/60'
                          : 'bg-[#111a2f] text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {mins} mins
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Includes opening, discussion, and closing rounds
                </p>
              </div>

              {/* AI Patience Setting */}
              <div className="p-4 rounded-xl bg-[#0d1527] border border-slate-800">
                <label className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-teal-400" />
                  Speech Turn Patience
                </label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {(['quick', 'balanced', 'patient'] as const).map((pat) => (
                    <button
                      key={pat}
                      type="button"
                      onClick={() => setPatience(pat)}
                      className={`py-2 px-2 text-xs font-medium rounded-lg border capitalize transition ${
                        patience === pat
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/60'
                          : 'bg-[#111a2f] text-slate-300 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {pat}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  {patience === 'quick' && 'Fast turns (600ms silence threshold)'}
                  {patience === 'balanced' && 'Natural dialogue (1000ms silence threshold)'}
                  {patience === 'patient' && 'Relaxed pauses (1500ms silence threshold)'}
                </p>
              </div>
            </div>

            {/* Discussion Engine Selector Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#0d1527] border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-teal-400" />
                  Discussion Intelligence Engine
                </label>
                {state.isAiConfigured ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Gemini Ready
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-medium flex items-center gap-1">
                    <Bot className="w-3 h-3" /> Demo Ready
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setEnginePreference('ai')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 ${
                    enginePreference === 'ai'
                      ? 'bg-teal-950/40 border-teal-500/60 ring-1 ring-teal-500/40'
                      : 'bg-[#111a2f] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-teal-400" /> Live Gemini LLM
                    </span>
                    {enginePreference === 'ai' && (
                      <span className="text-[10px] text-teal-400 font-bold">Active</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Real LLM generation via Google Gemini API (gemini-2.5-flash).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setEnginePreference('demo')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 ${
                    enginePreference === 'demo'
                      ? 'bg-teal-950/40 border-teal-500/60 ring-1 ring-teal-500/40'
                      : 'bg-[#111a2f] border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-amber-400" /> Deterministic Demo
                    </span>
                    {enginePreference === 'demo' && (
                      <span className="text-[10px] text-amber-400 font-bold">Active</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Scripted persona dialogue. Zero API key or network calls required.
                  </p>
                </button>
              </div>

              {!state.isAiConfigured && (
                <p className="text-[11px] text-amber-400/90 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>GEMINI_API_KEY is not set in .env.local. Demo mode will be used automatically.</span>
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Panel Personality Preview & Submit (5 cols) */}
          <div className="lg:col-span-5 space-y-6 flex flex-col justify-between">
            <div className="p-5 sm:p-6 rounded-2xl bg-[#0d1527] border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white">Selected Panel Preview</h2>
                <span className="text-xs text-slate-400 font-mono">
                  {activeParticipants.length + 2} in room
                </span>
              </div>

              <div className="space-y-3">
                {/* Faculty Moderator */}
                <div className="p-3 rounded-xl bg-[#111a2f] border border-emerald-500/30 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                    {MODERATOR.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{MODERATOR.name}</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                          Moderator
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400/80 flex items-center gap-1">
                        <Volume2 className="w-3 h-3" /> Voice: Ratan
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{MODERATOR.tagline}</p>
                  </div>
                </div>

                {/* You (Student) */}
                <div className="p-3 rounded-xl bg-[#111a2f] border border-teal-500/40 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-950/80 border border-teal-500/50 text-teal-300 flex items-center justify-center font-bold text-xs shrink-0">
                    {STUDENT_PARTICIPANT.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{STUDENT_PARTICIPANT.name}</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800/50">
                          Candidate Seat
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-teal-400/80 flex items-center gap-1">
                        <Mic className="w-3 h-3" /> Live Mic
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{STUDENT_PARTICIPANT.tagline}</p>
                  </div>
                </div>

                {/* AI Participants for Selected Panel Size */}
                <div className="pt-2">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    AI Peer Debaters ({activeParticipants.length})
                  </p>
                  <div className="space-y-2">
                    {activeParticipants.map((ai) => (
                      <div
                        key={ai.id}
                        className="p-2.5 rounded-xl bg-[#111a2f] border border-slate-800/90 flex items-start gap-3"
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${ai.avatarColor}`}
                        >
                          {ai.initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-200">{ai.name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/50">
                                {ai.personality}
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 capitalize">
                              Voice: {ai.voice?.sarvamVoice || 'Default'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {ai.tagline}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Action Button Card */}
            <div className="p-5 rounded-2xl bg-[#0d1527] border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Selected Topic:</span>
                <span className="text-slate-200 font-medium truncate max-w-[200px]">
                  {activeTopicTitle}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Mode:</span>
                <span className="text-teal-300 font-medium">
                  {interactionMode === 'voice' ? 'Voice Practice (Mic + Voices)' : 'Text-Only Practice'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Format:</span>
                <span className="text-slate-200">
                  {durationMinutes} min • {language === 'english' ? 'English' : 'Hinglish'}
                </span>
              </div>

              <button
                type="submit"
                id="enter-practice-room-btn"
                className="w-full py-3.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-sm tracking-wide transition shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 focus:ring-2 focus:ring-teal-400 focus:outline-none"
              >
                {interactionMode === 'voice' ? (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>Check Mic & Enter Arena</span>
                  </>
                ) : (
                  <>
                    <span>Enter practice room</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-[11px] text-slate-400">
                {interactionMode === 'voice'
                  ? 'Tests microphone and unlocks audio before entering'
                  : 'Deterministic text demo mode • Instant entry with zero setup'}
              </p>
            </div>
          </div>
        </form>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 px-4 sm:px-6 text-center text-xs text-slate-400">
        GD Arena • Phase 3 Voice Engine • Live Speech, Sarvam Bulbul Voices & Speech Interruptions
      </footer>
    </div>
  );
}
