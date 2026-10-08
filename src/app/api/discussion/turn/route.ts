import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import {
  Participant,
  TranscriptTurn,
  LanguagePreference,
  DiscussionPhase
} from '@/types/session';
import {
  buildSystemInstruction,
  buildUserPrompt
} from '@/lib/geminiPromptBuilder';

// Simple in-memory sliding window rate limiter
interface RateLimitRecord {
  timestamps: number[];
}
const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 35; // 35 requests per minute

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  let record = rateLimitMap.get(clientId);
  if (!record) {
    record = { timestamps: [] };
    rateLimitMap.set(clientId, record);
  }

  // Filter out timestamps outside window
  record.timestamps = record.timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (record.timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  record.timestamps.push(now);
  return true;
}

interface TurnRequestBody {
  topic: string;
  language: LanguagePreference;
  phase: DiscussionPhase;
  remainingSeconds: number;
  speaker: Participant;
  participants: Participant[];
  transcript: TranscriptTurn[];
  objective?: string;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting check
    const clientIp = req.headers.get('x-forwarded-for') || 'local-client';
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded: Please wait a moment before sending more turn requests.',
          retryable: true
        },
        { status: 429 }
      );
    }

    // 2. Parse and validate body
    let body: Partial<TurnRequestBody>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request payload.', retryable: false },
        { status: 400 }
      );
    }

    const {
      topic,
      language,
      phase,
      remainingSeconds,
      speaker,
      participants,
      transcript,
      objective
    } = body;

    // Validate topic
    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Topic is required and cannot be empty.', retryable: false },
        { status: 400 }
      );
    }
    if (topic.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Topic exceeds maximum length of 500 characters.', retryable: false },
        { status: 400 }
      );
    }

    // Validate speaker
    if (!speaker || !speaker.id || !speaker.name || !speaker.role) {
      return NextResponse.json(
        { success: false, error: 'A valid speaker must be specified.', retryable: false },
        { status: 400 }
      );
    }

    // Validate participants
    if (!Array.isArray(participants) || participants.length < 3) {
      return NextResponse.json(
        { success: false, error: 'Participant roster must have at least 3 participants.', retryable: false },
        { status: 400 }
      );
    }

    // Validate language
    const validLang: LanguagePreference = language === 'hinglish' ? 'hinglish' : 'english';
    const validPhase: DiscussionPhase =
      phase === 'opening' || phase === 'closing' ? phase : 'discussion';
    const validRemainingSecs = typeof remainingSeconds === 'number' ? Math.max(0, remainingSeconds) : 0;
    const validTranscript = Array.isArray(transcript) ? transcript : [];

    // 3. Check server-side Gemini API key
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          isConfigured: false,
          error:
            'GEMINI_API_KEY is not configured on the server. Please add GEMINI_API_KEY to your .env.local file to enable live AI discussion.',
          retryable: false
        },
        { status: 200 }
      );
    }

    // 4. Initialize official GoogleGenAI SDK
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
    const ai = new GoogleGenAI({ apiKey });

    // 5. Build prompt with XML isolation and persona constraints
    const promptParams = {
      topic: topic.trim(),
      language: validLang,
      phase: validPhase,
      remainingSeconds: validRemainingSecs,
      speaker,
      participants,
      recentTranscript: validTranscript,
      objective: objective || undefined
    };

    const systemInstruction = buildSystemInstruction(promptParams);
    const userPrompt = buildUserPrompt(promptParams);

    // 6. Generate content with structured JSON schema
    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            text: { type: 'STRING' },
            addressedParticipantId: { type: 'STRING', nullable: true },
            stanceUpdate: { type: 'STRING' }
          },
          required: ['text']
        },
        maxOutputTokens: 250,
        temperature: 0.7
      }
    });

    const responseText = response.text?.trim();
    if (!responseText) {
      return NextResponse.json(
        {
          success: false,
          error: 'Gemini returned an empty response. You can retry or switch to demo mode.',
          retryable: true
        },
        { status: 502 }
      );
    }

    // 7. Parse and validate JSON structure
    interface ParsedOutput {
      text: string;
      addressedParticipantId?: string | null;
      stanceUpdate?: string;
    }

    let parsed: ParsedOutput;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      // Clean fallback if model returned raw text despite schema
      parsed = {
        text: responseText.replace(/```json|```/g, '').trim(),
        addressedParticipantId: null
      };
    }

    // Clean text and check length
    const cleanedText = parsed.text?.trim() || '';
    if (cleanedText.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Model generated empty turn text. Please retry.',
          retryable: true
        },
        { status: 502 }
      );
    }

    // Validate addressed participant
    const validParticipantIds = new Set(participants.map((p) => p.id));
    const safeAddressedId =
      parsed.addressedParticipantId && validParticipantIds.has(parsed.addressedParticipantId)
        ? parsed.addressedParticipantId
        : null;

    return NextResponse.json({
      success: true,
      text: cleanedText,
      addressedParticipantId: safeAddressedId,
      stanceUpdate: parsed.stanceUpdate?.trim() || undefined,
      source: 'model',
      model
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[API /api/discussion/turn error]:', errorMessage);

    const isQuotaOrRateLimit =
      errorMessage.includes('429') ||
      errorMessage.includes('quota') ||
      errorMessage.includes('RESOURCE_EXHAUSTED');

    return NextResponse.json(
      {
        success: false,
        error: isQuotaOrRateLimit
          ? 'Gemini API rate limit or quota exceeded. You can retry in a moment or switch to demo mode.'
          : 'Failed to generate discussion turn: ' + errorMessage.slice(0, 150),
        retryable: true
      },
      { status: 500 }
    );
  }
}
