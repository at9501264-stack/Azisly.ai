import { NextResponse } from 'next/server';
import { getLlmProviderStatus } from '@/lib/llmClient';

export async function GET() {
  const status = getLlmProviderStatus();

  return NextResponse.json({
    isConfigured: status.isConfigured,
    primaryProvider: status.primaryProvider,
    fallbackProvider: status.fallbackProvider,
    model: status.isConfigured
      ? status.primaryProvider === 'groq'
        ? `Groq (${status.groqModel}) + Gemini Fallback`
        : `Gemini (${status.geminiModel})`
      : 'Deterministic Demo Fallback',
    supportedModels: [
      'openai/gpt-oss-120b (Groq Primary)',
      'gemini-2.5-flash (Gemini Fallback)'
    ]
  });
}
