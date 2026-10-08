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

function getSarvamKeyPool(): string[] {
  const pool: string[] = [];
  if (process.env.SARVAM_API_KEYS) {
    const list = process.env.SARVAM_API_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
    pool.push(...list);
  }
  if (process.env.SARVAM_API_KEY) {
    const single = process.env.SARVAM_API_KEY.trim();
    if (single && !pool.includes(single)) {
      pool.unshift(single);
    }
  }
  // Remove duplicates while preserving order
  return Array.from(new Set(pool));
}

interface SynthesisOptions {
  text: string;
  language: 'en-IN' | 'hi-IN';
  speaker: string;
  pace: number;
}

interface SynthesisResult {
  audioBase64?: string;
  error?: string;
  statusCode?: number;
  fatal?: boolean;
}

async function requestSarvamAudio(apiKey: string, options: SynthesisOptions): Promise<SynthesisResult> {
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
        text: options.text,
        model: 'bulbul:v3',
        language_code: options.language,
        speaker: options.speaker,
        pace: options.pace,
        output_audio_codec: 'mp3',
        speech_sample_rate: 24000
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const audioBase64 = data.audios?.[0];
      if (!audioBase64) {
        return { error: 'Sarvam TTS response did not contain audio data.', statusCode: 502 };
      }
      return { audioBase64 };
    }

    const errText = await response.text();
    const isClientError = response.status === 400;
    return {
      error: `Sarvam TTS API returned error (${response.status}): ${errText}`,
      statusCode: response.status >= 500 ? 502 : response.status,
      fatal: isClientError
    };
  } catch (fetchErr: unknown) {
    clearTimeout(timeout);
    const isAbort = (fetchErr as { name?: string })?.name === 'AbortError';
    const errMessage = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    return {
      error: isAbort ? 'Sarvam TTS request timed out after 12s.' : errMessage,
      statusCode: 504
    };
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local-user';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait a moment before synthesizing more speech.' },
        { status: 429 }
      );
    }

    const keyPool = getSarvamKeyPool();
    if (keyPool.length === 0) {
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

    const synthOptions: SynthesisOptions = {
      text: trimmedText,
      speaker: targetSpeaker,
      language: targetLanguage,
      pace: targetPace
    };

    let lastError = 'Unknown error';
    let lastStatusCode = 502;

    for (const activeKey of keyPool) {
      const res = await requestSarvamAudio(activeKey, synthOptions);
      if (res.audioBase64) {
        const wordCount = trimmedText.split(/\s+/).length;
        const durationEstimateMs = Math.round((wordCount / (150 * targetPace)) * 60 * 1000);

        return NextResponse.json({
          audioBase64: res.audioBase64,
          format: 'mp3',
          speaker: targetSpeaker,
          languageCode: targetLanguage,
          durationEstimateMs: Math.max(durationEstimateMs, 1000)
        });
      }

      lastError = res.error || lastError;
      lastStatusCode = res.statusCode || lastStatusCode;

      if (res.fatal) {
        return NextResponse.json({ error: lastError, code: 'UPSTREAM_ERROR' }, { status: 400 });
      }
    }

    return NextResponse.json(
      { error: `All configured Sarvam keys failed. Last error: ${lastError}`, code: 'UPSTREAM_ERROR' },
      { status: lastStatusCode }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Internal server error: ${msg}` }, { status: 500 });
  }
}

