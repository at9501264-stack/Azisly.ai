import { Participant } from '@/types/session';

export const MODERATOR: Participant = {
  id: 'mod-1',
  name: 'Prof. Sharma',
  role: 'moderator',
  initials: 'PS',
  personality: 'Neutral & Regulated',
  tagline: 'Manages opening, time pacing, redirection, and closing.',
  avatarColor: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40',
  accentColor: 'emerald',
  voice: {
    sarvamVoice: 'ratan',
    pace: 0.98,
    pitch: 0.95
  }
};

export const STUDENT_PARTICIPANT: Participant = {
  id: 'student-you',
  name: 'You (Student)',
  role: 'student',
  initials: 'ME',
  personality: 'Candidate (Your perspective)',
  tagline: 'Candidate practice seat. Enter points at any time.',
  avatarColor: 'bg-teal-950/80 text-teal-300 border-teal-500/50',
  accentColor: 'teal'
};

export const AI_PERSONAS: Record<'aarav' | 'meera' | 'kabir' | 'riya' | 'dev', Participant> = {
  aarav: {
    id: 'ai-aarav',
    name: 'Aarav',
    role: 'ai_participant',
    initials: 'AK',
    personality: 'Assertive',
    tagline: 'Challenges assumptions directly, speaks firmly, and drives debates forward.',
    avatarColor: 'bg-amber-950/80 text-amber-300 border-amber-500/40',
    accentColor: 'amber',
    voice: {
      sarvamVoice: 'aditya',
      pace: 1.08,
      pitch: 1.05
    }
  },
  meera: {
    id: 'ai-meera',
    name: 'Meera',
    role: 'ai_participant',
    initials: 'MS',
    personality: 'Analytical',
    tagline: 'Examines statistics, operational trade-offs, and systemic consequences.',
    avatarColor: 'bg-blue-950/80 text-blue-300 border-blue-500/40',
    accentColor: 'blue',
    voice: {
      sarvamVoice: 'ishita',
      pace: 1.0,
      pitch: 1.0
    }
  },
  kabir: {
    id: 'ai-kabir',
    name: 'Kabir',
    role: 'ai_participant',
    initials: 'KV',
    personality: 'Quiet & Thoughtful',
    tagline: 'Speaks selectively, delivering concise, grounded, and philosophical ideas.',
    avatarColor: 'bg-indigo-950/80 text-indigo-300 border-indigo-500/40',
    accentColor: 'indigo',
    voice: {
      sarvamVoice: 'kabir',
      pace: 0.92,
      pitch: 0.92
    }
  },
  riya: {
    id: 'ai-riya',
    name: 'Riya',
    role: 'ai_participant',
    initials: 'RP',
    personality: 'Tangential & Creative',
    tagline: 'Brings relatable anecdotes and creative angles, occasionally drifting off-center.',
    avatarColor: 'bg-rose-950/80 text-rose-300 border-rose-500/40',
    accentColor: 'rose',
    voice: {
      sarvamVoice: 'kavya',
      pace: 1.06,
      pitch: 1.08
    }
  },
  dev: {
    id: 'ai-dev',
    name: 'Dev',
    role: 'ai_participant',
    initials: 'DM',
    personality: 'Synthesizer & Diplomat',
    tagline: 'Resolves conflicting viewpoints, highlights common ground, and builds consensus.',
    avatarColor: 'bg-purple-950/80 text-purple-300 border-purple-500/40',
    accentColor: 'purple',
    voice: {
      sarvamVoice: 'dev',
      pace: 1.0,
      pitch: 1.0
    }
  }
};

/**
 * Builds the list of participants based on the selected panel size (3, 4, or 5).
 * For 3: Aarav, Meera, Kabir
 * For 4: + Riya
 * For 5: + Dev
 */
export function getParticipantsForPanel(count: 3 | 4 | 5): Participant[] {
  const panel: Participant[] = [
    AI_PERSONAS.aarav,
    AI_PERSONAS.meera,
    AI_PERSONAS.kabir
  ];

  if (count >= 4) {
    panel.push(AI_PERSONAS.riya);
  }
  if (count >= 5) {
    panel.push(AI_PERSONAS.dev);
  }

  return panel;
}
