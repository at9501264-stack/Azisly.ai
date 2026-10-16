/**
 * Gnani Vachana voice settings shared by the REST and streaming TTS routes.
 * Server-only: the API key never reaches the browser.
 */

export const GNANI_REST_URL = 'https://api.vachana.ai/api/v1/tts/inference';
export const GNANI_SSE_URL = 'https://api.vachana.ai/api/v1/tts/sse';

/** Streaming audio format; matches the browser's 24kHz PCM player. */
export const GNANI_STREAM_SAMPLE_RATE = 24000;

/**
 * Persona voice for each panelist, keyed by the persona's voice id.
 * timbre-v3.0 voices speak both English and Hindi, so they also handle Hinglish.
 */
const GNANI_VOICE_BY_SPEAKER: Record<string, string> = {
  ratan: 'Avinash', // Prof. Sharma: firm, deliberate moderator
  aditya: 'Shubham', // Aarav: energetic, confident
  ishita: 'Kalpana', // Meera: composed, analytical
  kabir: 'Yashraj', // Kabir: warm, reflective
  kavya: 'Riyaa', // Riya: lively, creative
  dev: 'Devansh' // Dev: young, conversational
};

export function getGnaniApiKey(): string | undefined {
  return process.env.GNANI_API_KEY?.trim() || undefined;
}

export function buildGnaniRequest(options: {
  text: string;
  speaker: string;
  language: 'en-IN' | 'hi-IN';
  pace: number;
  container: 'mp3' | 'raw';
}) {
  return {
    text: options.text,
    model: 'timbre-v3.0',
    voice: GNANI_VOICE_BY_SPEAKER[options.speaker] || 'Avinash',
    // Our Hinglish is Latin-script Hindi-English, which Gnani calls hi-en
    language: options.language === 'hi-IN' ? 'hi-en' : 'en-IN',
    speed: Math.min(1.15, Math.max(0.85, options.pace)),
    audio_config:
      options.container === 'raw'
        ? { sample_rate: GNANI_STREAM_SAMPLE_RATE, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'raw' }
        : { sample_rate: 24000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'mp3', bitrate: '64k' }
  };
}
