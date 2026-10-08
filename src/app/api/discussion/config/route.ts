import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const isConfigured = Boolean(apiKey && apiKey.length > 5);
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';

  return NextResponse.json({
    isConfigured,
    model: isConfigured ? model : 'Deterministic Demo Fallback',
    supportedModels: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite']
  });
}
