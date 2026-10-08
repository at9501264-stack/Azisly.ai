import { GoogleGenAI } from '@google/genai';

export interface LlmRequestOptions {
  systemInstruction?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LlmResponse {
  text: string;
  provider: 'groq' | 'gemini';
  model: string;
}

/**
 * Executes an LLM generation call with Groq as primary and Gemini as fallback.
 * Automatically tries Groq first (ultra-fast latency). If Groq is unconfigured
 * or encounters any error (rate limit, outage, network failure), it falls back
 * immediately to Gemini.
 */
export async function generateLlmCompletion(
  options: LlmRequestOptions
): Promise<LlmResponse> {
  const {
    systemInstruction,
    userPrompt,
    temperature = 0.7,
    maxTokens = 300,
    timeoutMs = 15000
  } = options;

  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();

  let groqError: Error | null = null;

  // =========================================================================
  // 1. PRIMARY PROVIDER: Groq
  // =========================================================================
  if (groqApiKey && groqApiKey.length > 5) {
    const groqModel = process.env.GROQ_MODEL?.trim() || 'qwen/qwen3.8-27b';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
      if (systemInstruction) {
        messages.push({
          role: 'system',
          content: `${systemInstruction}\n\nIMPORTANT: You must return strictly a valid JSON object.`
        });
      }
      messages.push({
        role: 'user',
        content: `${userPrompt}\n\nRespond strictly with a valid JSON object.`
      });

      // Rapid conversational token budget (~150-350 tokens for ultra-low latency response in <300ms)
      const groqMaxTokens = Math.min(Math.max(maxTokens, 150), 400);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: groqModel,
          messages,
          response_format: { type: 'json_object' },
          temperature,
          max_tokens: groqMaxTokens
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq HTTP ${response.status}: ${errorText.slice(0, 200)}`);
      }

      const data = await response.json();
      const choiceContent = data?.choices?.[0]?.message?.content?.trim();

      if (!choiceContent) {
        throw new Error('Groq returned an empty completion content.');
      }

      return {
        text: choiceContent,
        provider: 'groq',
        model: `groq/${groqModel}`
      };
    } catch (err: unknown) {
      groqError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[LLM Provider] Groq call failed (${groqError.message}). Engaging Gemini fallback...`
      );
    }
  }

  // =========================================================================
  // 2. FALLBACK PROVIDER: Google Gemini
  // =========================================================================
  if (geminiApiKey && geminiApiKey.length > 5) {
    const geminiModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Gemini call timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      );

      const callGemini = async () => {
        return await ai.models.generateContent({
          model: geminiModel,
          contents: userPrompt,
          config: {
            systemInstruction: systemInstruction || undefined,
            responseMimeType: 'application/json',
            maxOutputTokens: maxTokens,
            temperature
          }
        });
      };

      const response = await Promise.race([callGemini(), timeoutPromise]);
      const responseText = response.text?.trim();

      if (!responseText) {
        throw new Error('Gemini returned an empty response.');
      }

      return {
        text: responseText,
        provider: 'gemini',
        model: `gemini/${geminiModel}`
      };
    } catch (err: unknown) {
      const geminiError = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[LLM Provider] Gemini fallback also failed: ${geminiError.message}`
      );
      throw new Error(
        groqError
          ? `Primary (Groq: ${groqError.message}) and Fallback (Gemini: ${geminiError.message}) both failed.`
          : `Gemini call failed: ${geminiError.message}`
      );
    }
  }

  // =========================================================================
  // 3. Neither Provider Available
  // =========================================================================
  if (groqError) {
    throw new Error(
      `Groq primary provider failed (${groqError.message}) and no GEMINI_API_KEY is configured for fallback.`
    );
  }

  throw new Error(
    'Neither GROQ_API_KEY nor GEMINI_API_KEY is configured on the server.'
  );
}

/**
 * Checks which providers are configured in the current environment.
 */
export function getLlmProviderStatus() {
  const hasGroq = Boolean(
    process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 5
  );
  const hasGemini = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5
  );

  return {
    isConfigured: hasGroq || hasGemini,
    primaryProvider: hasGroq ? 'groq' : hasGemini ? 'gemini' : 'none',
    fallbackProvider: hasGroq && hasGemini ? 'gemini' : 'none',
    groqModel: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-120b',
    geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite'
  };
}
