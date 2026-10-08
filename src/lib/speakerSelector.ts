import { Participant, TranscriptTurn, DiscussionPhase } from '@/types/session';

export interface SpeakerSelectionDecision {
  speaker: Participant;
  objective?: 'open' | 'challenge' | 'build' | 'clarify' | 'redirect' | 'synthesize' | 'closing' | 'summary';
  reason: string;
}

export function shouldOfferStudentOpportunity(
  consecutiveAiTurns: number,
  phase: DiscussionPhase
): boolean {
  return phase === 'discussion' && consecutiveAiTurns >= 2;
}

export function selectNextSpeaker(params: {
  participants: Participant[];
  transcript: TranscriptTurn[];
  phase: DiscussionPhase;
  consecutiveAiTurns: number;
  remainingSeconds: number;
}): SpeakerSelectionDecision {
  const { participants, transcript, phase, remainingSeconds } = params;

  const moderator = participants.find((p) => p.role === 'moderator');
  const aiPeers = participants.filter((p) => p.role === 'ai_participant');

  if (!moderator || aiPeers.length === 0) {
    throw new Error('Invalid participant roster for speaker selection');
  }

  // 1. Opening Phase: Moderator always opens
  if (phase === 'opening') {
    return {
      speaker: moderator,
      objective: 'open',
      reason: 'Moderator opens the discussion session.'
    };
  }

  // 2. Closing Phase: Structured wrap-up
  if (phase === 'closing') {
    const closingTurns = transcript.filter(
      (t) => t.relativeTimestampMs >= (transcript[transcript.length - 1]?.relativeTimestampMs || 0) - 90000
    );

    const modOpeningCall = transcript.some(
      (t) => t.speakerRole === 'moderator' && t.text.toLowerCase().includes('concluding')
    );

    if (!modOpeningCall) {
      return {
        speaker: moderator,
        objective: 'closing',
        reason: 'Moderator invites panel and candidate for concluding remarks.'
      };
    }

    // Check which AI peers haven't delivered closing remarks
    const peersSpokenClosing = new Set(
      closingTurns.filter((t) => t.speakerRole === 'ai_participant').map((t) => t.speakerId)
    );

    const pendingPeers = aiPeers.filter((p) => !peersSpokenClosing.has(p.id));

    if (pendingPeers.length > 0 && remainingSeconds > 15) {
      return {
        speaker: pendingPeers[0],
        objective: 'closing',
        reason: `AI peer ${pendingPeers[0].name} gives concluding stance.`
      };
    }

    // Final summary by moderator
    return {
      speaker: moderator,
      objective: 'summary',
      reason: 'Moderator delivers final structured closing summary.'
    };
  }

  // 3. Discussion Phase
  const lastTurn = transcript[transcript.length - 1];
  const lastSpeakerId = lastTurn ? lastTurn.speakerId : null;

  // A. Check if the previous turn directly addressed a specific peer
  if (lastTurn?.addressedParticipantId) {
    const addressedPeer = aiPeers.find(
      (p) => p.id === lastTurn.addressedParticipantId && p.id !== lastSpeakerId
    );
    if (addressedPeer) {
      return {
        speaker: addressedPeer,
        objective: 'challenge',
        reason: `${addressedPeer.name} was addressed directly by previous speaker.`
      };
    }
  }

  // B. Candidate speaks when active; for AI peers, score candidates
  // Rule: avoid same participant speaking twice consecutively
  const eligiblePeers = aiPeers.filter((p) => p.id !== lastSpeakerId);

  // Compute turn counts for each peer
  const turnCounts: Record<string, number> = {};
  for (const p of aiPeers) {
    turnCounts[p.id] = 0;
  }
  for (const t of transcript) {
    if (turnCounts[t.speakerId] !== undefined) {
      turnCounts[t.speakerId] += 1;
    }
  }

  // Recency distance: how many turns ago did this peer last speak?
  const recencyDistance: Record<string, number> = {};
  for (const p of aiPeers) {
    let distance = 999;
    for (let i = transcript.length - 1; i >= 0; i--) {
      if (transcript[i].speakerId === p.id) {
        distance = transcript.length - 1 - i;
        break;
      }
    }
    recencyDistance[p.id] = distance;
  }

  // Score eligible candidates
  const scored = eligiblePeers.map((peer) => {
    let score = 0;

    // 1. Deficit bonus: peer has spoken fewer turns
    const minTurns = Math.min(...Object.values(turnCounts));
    const deficit = turnCounts[peer.id] - minTurns;
    score -= deficit * 8; // penalty for speaking too much

    // 2. Recency bonus: longer since last spoke
    score += Math.min(25, recencyDistance[peer.id] * 4);

    // 3. Personality tendencies
    if (peer.id === 'ai-aarav') {
      score += 2; // Assertive, eager to enter
    } else if (peer.id === 'ai-meera') {
      score += 1; // Analytical
    } else if (peer.id === 'ai-kabir') {
      score -= 2; // Quiet, enters thoughtfully and less frequently
    } else if (peer.id === 'ai-dev') {
      // Dev synthesizes: boost if last 2-3 turns had different viewpoints
      if (transcript.length >= 4) {
        score += 5;
      }
    }

    return { peer, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const chosen = scored[0]?.peer || eligiblePeers[0];

  // Determine objective
  let objective: SpeakerSelectionDecision['objective'] = 'build';
  if (chosen.id === 'ai-aarav') objective = 'challenge';
  else if (chosen.id === 'ai-meera') objective = 'clarify';
  else if (chosen.id === 'ai-dev') objective = 'synthesize';
  else if (chosen.id === 'ai-riya') objective = 'build';
  else if (chosen.id === 'ai-kabir') objective = 'clarify';

  return {
    speaker: chosen,
    objective,
    reason: `Fair rotation and personality weighting (turns: ${turnCounts[chosen.id]}, recency: ${recencyDistance[chosen.id]}).`
  };
}
