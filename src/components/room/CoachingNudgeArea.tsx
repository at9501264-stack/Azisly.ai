'use client';

import React from 'react';
import { Lightbulb } from 'lucide-react';
import { Participant, DiscussionPhase } from '@/types/session';

interface CoachingNudgeAreaProps {
  readonly activeSpeaker: Participant | null;
  readonly phase: DiscussionPhase;
}

export function CoachingNudgeArea({ activeSpeaker, phase }: Readonly<CoachingNudgeAreaProps>) {
  let tip = 'Listen actively to your peers. In group discussions, building onto previous points scores higher than starting isolated arguments.';

  if (phase === 'opening') {
    tip = 'The moderator is framing the discussion. Prepare your opening argument or decide if you want to be an early entrant.';
  } else if (phase === 'closing') {
    tip = 'Closing phase active: Summarize the broad consensus, highlight key trade-offs discussed, and avoid introducing completely new arguments.';
  } else if (activeSpeaker) {
    if (activeSpeaker.id === 'ai-aarav') {
      tip = 'Aarav is challenging assumptions aggressively. Acknowledge his urgency, then ground the debate in concrete implementation feasibility.';
    } else if (activeSpeaker.id === 'ai-meera') {
      tip = 'Meera raised empirical data and trade-offs. You can agree with her numbers and pivot to practical human or socio-economic impact.';
    } else if (activeSpeaker.id === 'ai-kabir') {
      tip = 'Kabir offered a quiet, ethical viewpoint. Build consensus by linking his values to practical business operations.';
    } else if (activeSpeaker.id === 'ai-riya') {
      tip = 'Riya shared an everyday anecdote. You can validate the relatable scenario while gently steering back to the core policy topic.';
    } else if (activeSpeaker.id === 'ai-dev') {
      tip = 'Dev is synthesizing opposing views. Reinforce the common ground and propose actionable takeaways.';
    } else if (activeSpeaker.role === 'student') {
      tip = 'You are currently speaking. Well done taking initiative! Panel members will respond to your perspective next.';
    }
  }

  return (
    <div className="p-3 sm:p-3.5 rounded-xl bg-[#141417] border border-[#27272a] flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 flex items-center justify-center shrink-0 mt-0.5">
        <Lightbulb className="w-4 h-4 text-zinc-300" />
      </div>
      <div className="flex-1 text-xs">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="font-semibold text-zinc-200">Coaching Nudge</span>
          <span className="text-[10px] text-zinc-500 font-mono">
            (Evidence-Based Coach • Phase 4)
          </span>
        </div>
        <p className="text-zinc-400 leading-relaxed">{tip}</p>
      </div>
    </div>
  );
}
