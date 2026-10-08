'use client';

import React from 'react';
import { Participant } from '@/types/session';
import { Volume2, Mic, MicOff, Sparkles, AudioWaveform } from 'lucide-react';

interface ParticipantCardProps {
  readonly participant: Participant;
  readonly isSpeaking: boolean;
  readonly isThinking?: boolean;
  readonly turnCount: number;
  readonly isVoiceMode?: boolean;
  readonly isMicMuted?: boolean;
}

export function ParticipantCard({
  participant,
  isSpeaking,
  isThinking = false,
  turnCount,
  isVoiceMode = false,
  isMicMuted = false
}: Readonly<ParticipantCardProps>) {
  const isStudent = participant.role === 'student';
  const isModerator = participant.role === 'moderator';

  // Role pill styles
  let roleBadgeLabel = 'Peer Debater';
  let roleBadgeClass = 'bg-slate-800 text-slate-300 border-slate-700/60';

  if (isStudent) {
    roleBadgeLabel = 'You (Candidate)';
    roleBadgeClass = 'bg-teal-950 text-teal-300 border-teal-700/60';
  } else if (isModerator) {
    roleBadgeLabel = 'Faculty Moderator';
    roleBadgeClass = 'bg-emerald-950 text-emerald-300 border-emerald-700/60';
  }

  const assignedVoice = participant.voice?.sarvamVoice;

  return (
    <div
      className={`relative p-3.5 sm:p-4 rounded-xl transition-all duration-200 border ${
        isSpeaking
          ? 'bg-[#121e36] border-teal-400 ring-2 ring-teal-400/40 shadow-lg shadow-teal-500/10'
          : isThinking
          ? 'bg-[#141b2d] border-amber-500/60 ring-1 ring-amber-500/40 shadow-lg shadow-amber-500/10'
          : 'bg-[#0d1527] border-slate-800/90 hover:border-slate-700/80'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-3">
          {/* Avatar with Initials */}
          <div
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 border transition-all ${
              isSpeaking
                ? 'ring-2 ring-teal-400 scale-105'
                : isThinking
                ? 'ring-2 ring-amber-400/80 animate-pulse'
                : ''
            } ${participant.avatarColor}`}
          >
            {participant.initials}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm sm:text-base text-slate-100">
                {participant.name}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${roleBadgeClass}`}
              >
                {roleBadgeLabel}
              </span>
              <span className="text-[10px] text-slate-400 hidden sm:inline">
                • {participant.personality}
              </span>
            </div>
          </div>
        </div>

        {/* State indicator: Thinking vs Speaking vs Listening */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {isThinking ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 animate-spin text-amber-400" />
              <span>Thinking...</span>
            </span>
          ) : isSpeaking ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40 text-xs font-semibold">
              {isVoiceMode ? (
                <AudioWaveform className="w-3.5 h-3.5 animate-pulse text-teal-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 animate-pulse text-teal-400" />
              )}
              <span>Speaking</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/40 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              <span>Listening</span>
            </span>
          )}

          <span className="text-[10px] text-slate-400">
            {turnCount} {turnCount === 1 ? 'turn' : 'turns'}
          </span>
        </div>
      </div>

      {/* Personality tagline */}
      <p className="text-xs text-slate-400 mt-2.5 line-clamp-2">
        {participant.tagline}
      </p>

      {/* Voice status label */}
      {isStudent ? (
        <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          {isVoiceMode ? (
            <>
              <span className="flex items-center gap-1 text-teal-300 font-medium">
                {isMicMuted ? (
                  <>
                    <MicOff className="w-3 h-3 text-rose-400" />
                    <span className="text-rose-300">Mic muted</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3 h-3 text-teal-400 animate-pulse" />
                    <span>Live mic listening</span>
                  </>
                )}
              </span>
              <span className="text-slate-400">Speak or type</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <MicOff className="w-3 h-3 text-slate-500" />
                Text-only practice mode
              </span>
              <span className="text-teal-400 font-medium">Text composer active</span>
            </>
          )}
        </div>
      ) : assignedVoice ? (
        <div className="mt-2.5 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-500">
          <span>Voice persona: <span className="text-slate-300 capitalize">{assignedVoice}</span></span>
          <span className="text-[10px] font-mono text-slate-400">Sarvam Bulbul:v3</span>
        </div>
      ) : null}
    </div>
  );
}
