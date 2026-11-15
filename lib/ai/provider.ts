import type { ZodType } from "zod/v4";

/**
 * Server-side boundary for structured AI generation. Callers depend on this
 * interface only, so the workflow can be tested with a fake provider and the
 * vendor can change without touching tool logic.
 */
export type AIErrorCode = "unconfigured" | "refusal" | "truncated" | "invalid_output" | "rate_limited" | "unavailable";

export interface AIError {
  code: AIErrorCode;
  /** Safe to show to the user (Arabic). */
  message: string;
  retryable: boolean;
}

export type AIResult<T> = { ok: true; data: T; model: string } | { ok: false; error: AIError };

export interface StructuredRequest<T> {
  system: string;
  prompt: string;
  /** The model's output is validated against this schema before it is returned. */
  schema: ZodType<T>;
  maxTokens?: number;
}

export interface StructuredAIProvider {
  readonly model: string;
  generate<T>(request: StructuredRequest<T>): Promise<AIResult<T>>;
}

export const AI_UNCONFIGURED: AIError = {
  code: "unconfigured",
  message: "الذكاء الاصطناعي غير مهيأ على الخادم. أضف ANTHROPIC_API_KEY إلى إعدادات البيئة.",
  retryable: false,
};
