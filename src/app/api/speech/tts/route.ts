import { NextRequest, NextResponse } from 'next/server';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitBucket>();
const MAX_REQUESTS_PER_MINUTE = 45;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateLimitMap.get(ip);

  if (!bucket || now > bucket.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (bucket.count >= MAX_REQUESTS_PER_MINUTE) {
    return false;
  }

  bucket.count++;
  return true;
}

const VALID_SARVAM_SPEAKERS = new Set([
  'ratan', 'aditya', 'ishita', 'kabir', 'kavya', 'dev',
  'shubh', 'priya', 'rahul', 'neha', 'ashutosh', 'rohan', 'simran'
]);

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local-user';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment before synthesizing more speech.' },
        { status: 429 }
      );
    }

    const apiKey = process.env.SARVAM_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'SARVAM_API_KEY is not configured on the server. Please add SARVAM_API_KEY to .env.local to enable Sarvam AI voices.',
          code: 'MISSING_API_KEY',
          configured: false
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { text, speaker = 'ratan', languageCode = 'en-IN', pace = 1.0 } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text must be a non-empty string.' }, { status: 400 });
    }

    const trimmedText = text.trim();
    if (trimmedText.length === 0 || trimmedText.length > 2500) {
      return NextResponse.json({ error: 'Text length must be between 1 and 2500 characters.' }, { status: 400 });
    }

    const targetSpeaker = VALID_SARVAM_SPEAKERS.has(speaker) ? speaker : 'ratan';
    const targetLanguage = languageCode === 'hi-IN' ? 'hi-IN' : 'en-IN';
    const targetPace = typeof pace === 'number' && pace >= 0.5 && pace <= 2.0 ? pace : 1.0;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'api-subscription-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: trimmedText,
          model: 'bulbul:v3',
          language_code: targetLanguage,
          speaker: targetSpeaker,
          pace: targetPace,
          output_audio_codec: 'mp3',
          speech_sample_rate: 24000
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        console.error('Sarvam TTS API Error:', response.status, errText);
        return NextResponse.json(
          { error: `Sarvam TTS API returned error (${response.status}): ${errText}`, code: 'UPSTREAM_ERROR' },
          { status: response.status >= 500 ? 502 : 400 }
        );
      }

      const data = await response.json();
      const audioBase64 = data.audios?.[0];

      if (!audioBase64) {
        return NextResponse.json(
          { error: 'Sarvam TTS response did not contain audio data.', code: 'INVALID_AUDIO' },
          { status: 502 }
        );
      }

      // Word count rough duration estimate: ~150 words per minute
      const wordCount = trimmedText.split(/\s+/).length;
      const durationEstimateMs = Math.round((wordCount / (150 * targetPace)) * 60 * 1000);

      return NextResponse.json({
        audioBase64,
        format: 'mp3',
        speaker: targetSpeaker,
        languageCode: targetLanguage,
        durationEstimateMs: Math.max(durationEstimateMs, 1000)
      });
    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      const isAbort = (fetchErr as { name?: string })?.name === 'AbortError';
      const msg = isAbort ? 'Sarvam TTS request timed out after 12s.' : String(fetchErr);
      return NextResponse.json({ error: msg, code: 'NETWORK_TIMEOUT' }, { status: 504 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Internal server error: ${msg}` }, { status: 500 });
  }
}
