'use client';

import React from 'react';
import { Mic, Activity, Volume2 } from 'lucide-react';
import { VoiceFlowState } from '@/types/session';

interface LiveCaptionsBarProps {
  liveCaption: string;
  flowState: VoiceFlowState;
  activeSpeakerName: string | null;
  onInterrupt?: () => void;
  isVoiceMode: boolean;
}

export function LiveCaptionsBar({
  liveCaption,
  flowState,
  activeSpeakerName,
  onInterrupt,
  isVoiceMode
}: LiveCaptionsBarProps) {
  if (!isVoiceMode && !liveCaption) return null;

  const isStudentSpeaking = flowState === 'student_speaking' || Boolean(liveCaption);
  const isAiSpeaking = flowState === 'ai_speaking';

  return (
    <div className="w-full bg-[#141417] border-t border-[#27272a] px-4 py-3 flex items-center justify-between text-xs">
      <div className="flex items-center gap-3 overflow-hidden flex-1 mr-4">
        {/* Status Icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isStudentSpeaking ? (
            <span className="flex items-center gap-1 text-white font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-zinc-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-200"></span>
              </span>
              <Mic className="w-3.5 h-3.5" />
              <span>Transcribing you:</span>
            </span>
          ) : isAiSpeaking ? (
            <span className="flex items-center gap-1 text-zinc-300 font-medium">
              <Volume2 className="w-3.5 h-3.5 animate-pulse" />
              <span>{activeSpeakerName || 'AI'} is speaking</span>
            </span>
          ) : flowState === 'thinking' ? (
            <span className="flex items-center gap-1 text-zinc-400 font-medium">
              <Activity className="w-3.5 h-3.5 animate-spin" />
              <span>AI is thinking...</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-zinc-400">
              <Mic className="w-3.5 h-3.5 text-zinc-500" />
              <span>Listening (Mic active)</span>
            </span>
          )}
        </div>

        {/* Caption Text */}
        <div className="truncate text-zinc-200 font-mono text-[11px] flex-1">
          {liveCaption ? (
            <span className="text-zinc-100 italic">&ldquo;{liveCaption}&rdquo;</span>
          ) : isAiSpeaking ? (
            <span className="text-zinc-400">Listening to participant contribution...</span>
          ) : (
            <span className="text-zinc-500">Speak at any time or interject to challenge a point</span>
          )}
        </div>
      </div>

      {/* Interrupt / Take Floor Button */}
      {isAiSpeaking && onInterrupt && (
        <button
          onClick={onInterrupt}
          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-[11px] font-medium transition flex items-center gap-1.5 shrink-0 active:scale-95 cursor-pointer"
          title="Immediately pause AI voice and take the floor"
        >
          <Mic className="w-3 h-3 text-zinc-300" />
          <span>Interrupt / Speak</span>
        </button>
      )}
    </div>
  );
}
