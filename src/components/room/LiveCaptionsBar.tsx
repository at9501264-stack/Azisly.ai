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
    <div className="w-full bg-slate-900/90 border-t border-slate-800/80 px-4 py-2.5 backdrop-blur flex items-center justify-between text-xs">
      <div className="flex items-center gap-3 overflow-hidden flex-1 mr-4">
        {/* Status Icon */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isStudentSpeaking ? (
            <span className="flex items-center gap-1 text-teal-400 font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
              </span>
              <Mic className="w-3.5 h-3.5" />
              <span>Transcribing you:</span>
            </span>
          ) : isAiSpeaking ? (
            <span className="flex items-center gap-1 text-amber-400 font-medium">
              <Volume2 className="w-3.5 h-3.5 animate-pulse" />
              <span>{activeSpeakerName || 'AI'} is speaking</span>
            </span>
          ) : flowState === 'thinking' ? (
            <span className="flex items-center gap-1 text-indigo-400 font-medium">
              <Activity className="w-3.5 h-3.5 animate-spin" />
              <span>AI is thinking...</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-400">
              <Mic className="w-3.5 h-3.5 text-slate-500" />
              <span>Listening (Mic active)</span>
            </span>
          )}
        </div>

        {/* Caption Text */}
        <div className="truncate text-slate-200 font-mono text-[11px] flex-1">
          {liveCaption ? (
            <span className="text-teal-200 italic">&ldquo;{liveCaption}&rdquo;</span>
          ) : isAiSpeaking ? (
            <span className="text-slate-400">Listening to participant contribution...</span>
          ) : (
            <span className="text-slate-500">Speak at any time or interject to challenge a point</span>
          )}
        </div>
      </div>

      {/* Interrupt / Take Floor Button */}
      {isAiSpeaking && onInterrupt && (
        <button
          onClick={onInterrupt}
          className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-[11px] font-medium transition flex items-center gap-1.5 shrink-0 active:scale-95"
          title="Immediately pause AI voice and take the floor"
        >
          <Mic className="w-3 h-3 text-amber-400" />
          <span>Interrupt / Speak</span>
        </button>
      )}
    </div>
  );
}
