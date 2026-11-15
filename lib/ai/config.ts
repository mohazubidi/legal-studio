import "server-only";

/**
 * AI configuration, server-side only. Nothing here is exposed to the browser:
 * no NEXT_PUBLIC_ prefix, and every importer is a server module.
 *
 *   ANTHROPIC_API_KEY        required to enable AI generation
 *   LEGAL_STUDIO_AI_MODEL    optional, default claude-opus-5-5
 *   LEGAL_STUDIO_AI_EFFORT   optional: low | medium | high | xhigh | max (default high)
 */

export type AIEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AIConfig {
  apiKey: string;
  model: string;
  effort: AIEffort;
}

export const DEFAULT_AI_MODEL = "claude-opus-5-5";
const EFFORTS: readonly AIEffort[] = ["low", "medium", "high", "xhigh", "max"];

export function getAIConfig(): AIConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const effort = process.env.LEGAL_STUDIO_AI_EFFORT?.trim() as AIEffort | undefined;
  return {
    apiKey,
    model: process.env.LEGAL_STUDIO_AI_MODEL?.trim() || DEFAULT_AI_MODEL,
    effort: effort && EFFORTS.includes(effort) ? effort : "high",
  };
}

export function isAIConfigured(): boolean {
  return getAIConfig() !== null;
}

/**
 * Transcription for audio sources (OpenAI-compatible `/audio/transcriptions` endpoint).
 *
 *   TRANSCRIPTION_API_URL    e.g. https://api.openai.com/v1/audio/transcriptions
 *   TRANSCRIPTION_API_KEY    bearer token for that endpoint
 *   TRANSCRIPTION_MODEL      e.g. whisper-1
 *   TRANSCRIPTION_LANGUAGE   optional ISO-639-1 hint, default "ar"
 */
export interface TranscriptionConfig {
  url: string;
  apiKey: string;
  model: string;
  language: string;
}

export function getTranscriptionConfig(): TranscriptionConfig | null {
  const url = process.env.TRANSCRIPTION_API_URL?.trim();
  const apiKey = process.env.TRANSCRIPTION_API_KEY?.trim();
  const model = process.env.TRANSCRIPTION_MODEL?.trim();
  if (!url || !apiKey || !model) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url, apiKey, model, language: process.env.TRANSCRIPTION_LANGUAGE?.trim() || "ar" };
}
