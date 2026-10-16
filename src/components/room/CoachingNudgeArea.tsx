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
    <div className="flex items-start gap-3 border-b border-hair bg-marigold-soft/40 px-4 py-3">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
      <p className="text-sm leading-relaxed text-ink">
        <span className="font-semibold">Tip: </span>
        {tip}
      </p>
    </div>
  );
}
