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
  let roleBadgeClass = 'bg-zinc-900 text-zinc-400 border-zinc-800';

  if (isStudent) {
    roleBadgeLabel = 'You (Candidate)';
    roleBadgeClass = 'bg-zinc-800 text-zinc-200 border-zinc-700';
  } else if (isModerator) {
    roleBadgeLabel = 'Faculty Moderator';
    roleBadgeClass = 'bg-zinc-900 text-zinc-300 border-zinc-800';
  }

  const assignedVoice = participant.voice?.sarvamVoice;

  return (
    <div
      className={`relative p-3.5 sm:p-4 rounded-xl transition-all duration-200 border ${
        isSpeaking
          ? 'bg-[#1c1c21] border-zinc-400 ring-1 ring-zinc-400/40'
          : isThinking
          ? 'bg-[#18181c] border-zinc-600'
          : 'bg-[#141417] border-[#27272a] hover:border-zinc-700'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-3">
          {/* Avatar with Initials */}
          <div
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 border transition-all ${
              isSpeaking
                ? 'ring-1 ring-zinc-300 scale-102 bg-zinc-800 text-white border-zinc-500'
                : isThinking
                ? 'ring-1 ring-zinc-500 animate-pulse bg-zinc-800 text-zinc-200 border-zinc-700'
                : 'bg-zinc-900 text-zinc-300 border-zinc-800'
            }`}
          >
            {participant.initials}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm sm:text-base text-white">
                {participant.name}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${roleBadgeClass}`}
              >
                {roleBadgeLabel}
              </span>
              <span className="text-[10px] text-zinc-500 hidden sm:inline">
                • {participant.personality}
              </span>
            </div>
          </div>
        </div>

        {/* State indicator: Thinking vs Speaking vs Listening */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          {isThinking ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5 animate-spin text-zinc-300" />
              <span>Thinking...</span>
            </span>
          ) : isSpeaking ? (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-950 border border-zinc-200 text-xs font-semibold">
              {isVoiceMode ? (
                <AudioWaveform className="w-3.5 h-3.5 animate-pulse text-zinc-950" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 animate-pulse text-zinc-950" />
              )}
              <span>Speaking</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              <span>Listening</span>
            </span>
          )}

          <span className="text-[10px] text-zinc-500">
            {turnCount} {turnCount === 1 ? 'turn' : 'turns'}
          </span>
        </div>
      </div>

      {/* Personality tagline */}
      <p className="text-xs text-zinc-400 mt-2.5 line-clamp-2">
        {participant.tagline}
      </p>

      {/* Voice status label */}
      {isStudent ? (
        <div className="mt-2.5 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
          {isVoiceMode ? (
            <>
              <span className="flex items-center gap-1 text-zinc-300 font-medium">
                {isMicMuted ? (
                  <>
                    <MicOff className="w-3 h-3 text-rose-400" />
                    <span className="text-rose-300">Mic muted</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-3 h-3 text-zinc-300 animate-pulse" />
                    <span>Live mic listening</span>
                  </>
                )}
              </span>
              <span className="text-zinc-500">Speak or type</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1">
                <MicOff className="w-3 h-3 text-zinc-500" />
                Text-only practice mode
              </span>
              <span className="text-zinc-300 font-medium">Composer active</span>
            </>
          )}
        </div>
      ) : assignedVoice ? (
        <div className="mt-2.5 pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
          <span>Voice: <span className="text-zinc-300 capitalize">{assignedVoice}</span></span>
          <span className="text-[10px] font-mono text-zinc-500">Sarvam Bulbul</span>
        </div>
      ) : null}
    </div>
  );
}
