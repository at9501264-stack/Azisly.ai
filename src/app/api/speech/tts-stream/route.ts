import { NextRequest, NextResponse } from 'next/server';
import { GNANI_SSE_URL, buildGnaniRequest, getGnaniApiKey } from '@/lib/gnaniVoice';

/**
 * Streams a panelist's voice as Server-Sent Events of base64 24kHz PCM chunks,
 * relayed from Gnani. Playback can start on the first chunk (~1s) instead of
 * waiting for the whole file. Errors before streaming return JSON so the client
 * can fall back to /api/speech/tts.
 */

const MAX_REQUESTS_PER_MINUTE = 45;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateLimitMap.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= MAX_REQUESTS_PER_MINUTE) return false;
  bucket.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local-user';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Rate limit exceeded.', code: 'RATE_LIMITED' }, { status: 429 });
  }

  const apiKey = getGnaniApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'Streaming voice is not configured.', code: 'MISSING_API_KEY' }, { status: 503 });
  }

  let body: { text?: unknown; speaker?: unknown; languageCode?: unknown; pace?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 2500) {
    return NextResponse.json({ error: 'Text length must be between 1 and 2500 characters.' }, { status: 400 });
  }

  const upstream = await fetch(GNANI_SSE_URL, {
    method: 'POST',
    headers: {
      'X-API-Key-ID': apiKey,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream'
    },
    body: JSON.stringify(
      buildGnaniRequest({
        text,
        speaker: typeof body.speaker === 'string' ? body.speaker : 'ratan',
        language: body.languageCode === 'hi-IN' ? 'hi-IN' : 'en-IN',
        pace: typeof body.pace === 'number' ? body.pace : 1,
        container: 'raw'
      })
    ),
    // Stop paying for audio nobody will hear when the client goes away
    signal: req.signal
  }).catch((err: unknown) => err as Error);

  if (upstream instanceof Error) {
    return NextResponse.json({ error: 'Voice stream unavailable.', code: 'UPSTREAM_ERROR' }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.warn(`[TTS stream] Gnani returned ${upstream.status}: ${detail.slice(0, 200)}`);
    return NextResponse.json({ error: 'Voice stream unavailable.', code: 'UPSTREAM_ERROR' }, { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no'
    }
  });
}
