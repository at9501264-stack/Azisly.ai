'use client';

import React, { useEffect, useRef } from 'react';
import { TranscriptTurn, Participant, ParticipantRole } from '@/types/session';
import { MessageSquare, Bot, Volume2, ShieldAlert } from 'lucide-react';

interface TranscriptViewProps {
  readonly transcript: TranscriptTurn[];
  readonly participants: Participant[];
  readonly activeSpeakerId: string | null;
  readonly isVisible: boolean;
  readonly liveCaption?: string;
  readonly isGenerating?: boolean;
  readonly generatingSpeakerName?: string | null;
}

function getTurnCardStyle(role: ParticipantRole, isInterrupted?: boolean): string {
  if (isInterrupted) return 'bg-[#181512] border-amber-800/40';
  if (role === 'student') return 'bg-[#1a1a20] border-zinc-700 ml-2';
  if (role === 'moderator') return 'bg-[#121215] border-zinc-800 mr-2';
  return 'bg-[#101013] border-[#27272a] hover:border-zinc-700';
}

function getSpeakerNameColor(role: ParticipantRole): string {
  if (role === 'student') return 'text-white font-semibold';
  if (role === 'moderator') return 'text-zinc-200 font-semibold';
  return 'text-zinc-300 font-medium';
}

export function TranscriptView({
  transcript,
  activeSpeakerId,
  isVisible,
  liveCaption,
  isGenerating,
  generatingSpeakerName
}: Readonly<TranscriptViewProps>) {
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new turns or live speech
  useEffect(() => {
    if (isVisible && scrollEndRef.current) {
      scrollEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript.length, isVisible, activeSpeakerId, liveCaption, isGenerating]);

  if (!isVisible) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center text-zinc-500 bg-[#141417] rounded-xl border border-[#27272a]">
        <MessageSquare className="w-8 h-8 mb-2 stroke-[1.5]" />
        <p className="text-sm font-medium text-zinc-400">Live Captions & Transcript Hidden</p>
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
      className="h-full flex flex-col bg-[#141417] rounded-xl border border-[#27272a] overflow-hidden"
    >
      {/* Transcript Header */}
      <div className="px-4 py-3 bg-[#101013] border-b border-[#27272a] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-200">Live GD Transcript</span>
        </div>
        <span className="text-[11px] text-zinc-500 font-mono">
          {transcript.length} {transcript.length === 1 ? 'turn' : 'turns'} recorded
        </span>
      </div>

      {/* Transcript Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth">
        {transcript.length === 0 && !liveCaption ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 text-zinc-400">
            <div className="w-10 h-10 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2 text-zinc-400">
              <Bot className="w-5 h-5 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-300">Awaiting opening address...</p>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs">
              Prof. Sharma will open the session shortly. You can also start the discussion yourself anytime using your voice or keyboard.
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
                id={`turn-${turn.id}`}
                className={`p-3.5 rounded-xl border transition-colors ${cardStyle}`}
              >
                {/* Header row: Speaker Name, Badge, Time */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${nameColor}`}>{turn.speakerName}</span>
                    <span
                      className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border uppercase tracking-wider ${
                        isStudent
                          ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                          : isModerator
                          ? 'bg-zinc-900 text-zinc-300 border-zinc-800'
                          : 'bg-zinc-900 text-zinc-400 border-zinc-800'
                      }`}
                    >
                      {isStudent ? 'Candidate' : isModerator ? 'Moderator' : 'Peer'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                    {isInterrupted && (
                      <span className="flex items-center gap-1 text-amber-400 font-sans font-medium">
                        <ShieldAlert className="w-3 h-3" />
                        <span>Interrupted</span>
                      </span>
                    )}
                    {isInProgress && (
                      <span className="flex items-center gap-1 text-zinc-300">
                        <Volume2 className="w-3 h-3 animate-pulse" />
                        <span>Speaking...</span>
                      </span>
                    )}
                    <span>{formatTime(turn.relativeTimestampMs)}</span>
                  </div>
                </div>

                {/* Turn Text */}
                <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed font-sans">
                  {turn.deliveryStatus === 'interrupted' && turn.deliveredText
                    ? turn.deliveredText
                    : turn.text}
                </p>

                {/* Unspoken tail indicator */}
                {isInterrupted && turn.deliveredText && turn.deliveredText !== turn.text && (
                  <p className="text-[10px] text-zinc-500 italic mt-1 border-t border-zinc-800/80 pt-1">
                    (Audio was cut off mid-speech; remaining sentence excluded from room context)
                  </p>
                )}
              </div>
            );
          })
        )}

        {/* Live speech feedback right inside transcript */}
        {Boolean(liveCaption) && (
          <div className="p-3.5 rounded-xl border border-zinc-700 bg-[#16161c] ml-2 animate-pulse">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white font-semibold">You (Candidate)</span>
                <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded border uppercase tracking-wider bg-zinc-800 text-zinc-200 border-zinc-700">
                  Transcribing Live
                </span>
              </div>
              <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
                <Volume2 className="w-3 h-3 animate-pulse text-zinc-300" />
                Live
              </span>
            </div>
            <p className="text-xs sm:text-sm text-zinc-100 italic leading-relaxed font-sans">
              &ldquo;{liveCaption}&rdquo;
            </p>
          </div>
        )}

        {/* Peer formulating response indicator */}
        {Boolean(isGenerating) && (
          <div className="p-3 rounded-xl border border-zinc-800/80 bg-[#121215] text-xs text-zinc-400 flex items-center gap-2 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-zinc-400 animate-ping" />
            <span>{generatingSpeakerName || 'Next Speaker'} is preparing to respond...</span>
          </div>
        )}

        <div ref={scrollEndRef} />
      </div>
    </div>
  );
}
