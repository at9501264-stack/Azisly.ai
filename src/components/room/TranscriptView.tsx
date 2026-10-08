'use client';

import React, { useEffect, useRef } from 'react';
import { TranscriptTurn, Participant, ParticipantRole } from '@/types/session';
import { MessageSquare, Bot, Volume2, ShieldAlert } from 'lucide-react';

interface TranscriptViewProps {
  readonly transcript: TranscriptTurn[];
  readonly participants: Participant[];
  readonly activeSpeakerId: string | null;
  readonly isVisible: boolean;
}

function getTurnCardStyle(role: ParticipantRole, isInterrupted?: boolean): string {
  if (isInterrupted) return 'bg-amber-950/20 border-amber-600/40';
  if (role === 'student') return 'bg-teal-950/30 border-teal-500/40 ml-2';
  if (role === 'moderator') return 'bg-emerald-950/20 border-emerald-500/30 mr-2';
  return 'bg-[#0f182c] border-slate-800/90 hover:border-slate-700/80';
}

function getSpeakerNameColor(role: ParticipantRole): string {
  if (role === 'student') return 'text-teal-300';
  if (role === 'moderator') return 'text-emerald-300';
  return 'text-slate-200';
}

export function TranscriptView({
  transcript,
  activeSpeakerId,
  isVisible
}: Readonly<TranscriptViewProps>) {
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new turns
  useEffect(() => {
    if (isVisible && scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript.length, isVisible, activeSpeakerId]);

  if (!isVisible) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 bg-[#0d1527] rounded-2xl border border-slate-800">
        <MessageSquare className="w-8 h-8 mb-2 stroke-[1.5]" />
        <p className="text-sm font-medium text-slate-400">Live Captions & Transcript Hidden</p>
        <p className="text-xs mt-1">Use the captions toggle button in controls to view live speech.</p>
      </div>
    );
  }

  // Format relative timestamp in mm:ss
  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col bg-[#0b1222] rounded-2xl border border-slate-800 overflow-hidden"
    >
      {/* Transcript Header */}
      <div className="px-4 py-3 bg-[#0e172a] border-b border-slate-800/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-teal-400" />
          <span className="text-xs font-semibold text-slate-200">Live GD Transcript</span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {transcript.length} {transcript.length === 1 ? 'turn' : 'turns'} recorded
        </span>
      </div>

      {/* Transcript Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scroll-smooth">
        {transcript.length === 0 ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <div className="w-10 h-10 rounded-full bg-slate-800/70 flex items-center justify-center mb-2 text-slate-400">
              <Bot className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-300">Awaiting opening address...</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs">
              Prof. Sharma will open the session shortly. You can enter your thoughts anytime using your voice or keyboard.
            </p>
          </div>
        ) : (
          transcript.map((turn, index) => {
            const isStudent = turn.speakerRole === 'student';
            const isModerator = turn.speakerRole === 'moderator';
            const isInterrupted = turn.deliveryStatus === 'interrupted';
            const isInProgress = turn.deliveryState === 'in-progress';
            const cardStyle = getTurnCardStyle(turn.speakerRole, isInterrupted);
            const nameColor = getSpeakerNameColor(turn.speakerRole);

            return (
              <div
                key={turn.id || `turn-${index}`}
                className={`p-3.5 rounded-xl border transition-colors ${cardStyle}`}
              >
                {/* Speaker Header */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold ${nameColor}`}>
                      {turn.speakerName}
                    </span>

                    {isStudent && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 font-medium">
                        You
                      </span>
                    )}

                    {isModerator && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                        Moderator
                      </span>
                    )}

                    {turn.source === 'model' && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                        Gemini AI
                      </span>
                    )}

                    {turn.source === 'scripted-demo' && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                        Demo response
                      </span>
                    )}

                    {isInProgress && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 font-mono">
                        <Volume2 className="w-2.5 h-2.5 animate-pulse" /> Speaking...
                      </span>
                    )}

                    {isInterrupted && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950/80 text-amber-300 border border-amber-600/50 flex items-center gap-1 font-mono">
                        <ShieldAlert className="w-2.5 h-2.5 text-amber-400" /> Interrupted by candidate
                      </span>
                    )}

                    {turn.stanceUpdate && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#162238] text-slate-300 border border-slate-700/60 hidden sm:inline">
                        {turn.stanceUpdate}
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {formatTime(turn.relativeTimestampMs)}
                  </span>
                </div>

                {/* Spoken content */}
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                  {isInterrupted && turn.deliveredText ? turn.deliveredText : turn.text}
                </p>

                {isInterrupted && turn.deliveredText && turn.deliveredText !== turn.text && (
                  <p className="text-[11px] text-slate-400 italic mt-1 pt-1 border-t border-slate-800/80">
                    Unspoken portion cut off upon candidate interjection.
                  </p>
                )}
              </div>
            );
          })
        )}
        <div ref={scrollEndRef} />
      </div>
    </div>
  );
}
