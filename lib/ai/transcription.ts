import "server-only";
import { z } from "zod";
import type { DocumentSegment } from "@/types/database";
import { getTranscriptionConfig } from "./config";

export type TranscriptionResult =
  | { ok: true; segments: DocumentSegment[]; text: string }
  | { ok: false; unavailable: boolean; message: string };

export const TRANSCRIPTION_UNAVAILABLE_MESSAGE =
  "التفريغ الصوتي غير متاح: لم تُضبط خدمة التفريغ على الخادم (TRANSCRIPTION_API_URL و TRANSCRIPTION_API_KEY و TRANSCRIPTION_MODEL). لم يُفرَّغ التسجيل.";

/** verbose_json response of OpenAI-compatible transcription endpoints. */
const responseSchema = z.object({
  text: z.string(),
  segments: z
    .array(z.object({ start: z.number(), end: z.number(), text: z.string() }))
    .optional(),
});

function timestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Merges short timed spans into citable segments labelled by time range. */
export function segmentsFromTranscript(
  parsed: z.infer<typeof responseSchema>,
  maxChars = 1200,
): DocumentSegment[] {
  const spans = parsed.segments?.filter((span) => span.text.trim()) ?? [];
  if (spans.length === 0) {
    const text = parsed.text.trim();
    return text ? [{ id: "t1", label: "التفريغ الكامل", text }] : [];
  }

  const segments: DocumentSegment[] = [];
  let group: typeof spans = [];
  const flush = () => {
    if (group.length === 0) return;
    segments.push({
      id: `t${segments.length + 1}`,
      label: `${timestamp(group[0].start)}–${timestamp(group[group.length - 1].end)}`,
      text: group.map((span) => span.text.trim()).join(" "),
    });
    group = [];
  };
  for (const span of spans) {
    const length = group.reduce((sum, item) => sum + item.text.length, 0);
    if (group.length > 0 && length + span.text.length > maxChars) flush();
    group.push(span);
  }
  flush();
  return segments;
}

/**
 * Transcribes an audio source. Never fabricates a transcript: when no provider
 * is configured the result is `unavailable` and the source stays untranscribed.
 */
export async function transcribeAudio(bytes: Uint8Array, mimeType: string, fileName: string): Promise<TranscriptionResult> {
  const config = getTranscriptionConfig();
  if (!config) return { ok: false, unavailable: true, message: TRANSCRIPTION_UNAVAILABLE_MESSAGE };

  const form = new FormData();
  form.append("file", new Blob([Buffer.from(bytes)], { type: mimeType }), fileName);
  form.append("model", config.model);
  form.append("language", config.language);
  form.append("response_format", "verbose_json");

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(5 * 60_000),
    });
  } catch (error) {
    console.error("[transcription] request failed:", error);
    return { ok: false, unavailable: false, message: "تعذّر الاتصال بخدمة التفريغ الصوتي. أعد المحاولة." };
  }

  if (!response.ok) {
    console.error("[transcription] provider error:", response.status);
    return { ok: false, unavailable: false, message: `رفضت خدمة التفريغ الصوتي الطلب (رمز ${response.status}).` };
  }

  const parsed = responseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return { ok: false, unavailable: false, message: "أعادت خدمة التفريغ استجابة غير متوقعة." };
  }

  const segments = segmentsFromTranscript(parsed.data);
  if (segments.length === 0) return { ok: false, unavailable: false, message: "لم يُعثر على كلام في التسجيل." };
  return { ok: true, segments, text: segments.map((s) => `[${s.label}]\n${s.text}`).join("\n\n") };
}
