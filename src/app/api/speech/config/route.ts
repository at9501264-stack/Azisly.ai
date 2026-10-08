import { NextResponse } from 'next/server';

export async function GET() {
  const isSarvamConfigured = Boolean(process.env.SARVAM_API_KEY && process.env.SARVAM_API_KEY.trim().length > 0);
  
  return NextResponse.json({
    sarvamConfigured: isSarvamConfigured,
    defaultTtsModel: 'bulbul:v3',
    defaultSttModel: 'saaras:v4',
    supportedLanguages: ['en-IN', 'hi-IN'],
    voices: [
      { id: 'ratan', label: 'Prof. Sharma (Moderator)', role: 'moderator' },
      { id: 'aditya', label: 'Aarav (Assertive)', role: 'ai_participant' },
      { id: 'ishita', label: 'Meera (Analytical)', role: 'ai_participant' },
      { id: 'kabir', label: 'Kabir (Quiet & Thoughtful)', role: 'ai_participant' },
      { id: 'kavya', label: 'Riya (Creative)', role: 'ai_participant' },
      { id: 'dev', label: 'Dev (Synthesizer)', role: 'ai_participant' }
    ]
  });
}
