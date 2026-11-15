import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getAIConfig } from "./config";
import { AI_UNCONFIGURED, type AIResult, type StructuredAIProvider, type StructuredRequest } from "./provider";

/** Claude implementation of the structured provider. The API key never leaves the server. */
class AnthropicProvider implements StructuredAIProvider {
  constructor(
    private readonly client: Anthropic,
    readonly model: string,
    private readonly effort: NonNullable<ReturnType<typeof getAIConfig>>["effort"],
  ) {}

  async generate<T>({ system, prompt, schema, maxTokens = 64000 }: StructuredRequest<T>): Promise<AIResult<T>> {
    try {
      // Streaming keeps long generations clear of HTTP timeouts.
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: prompt }],
        thinking: { type: "adaptive" },
        output_config: { effort: this.effort, format: betaZodOutputFormat(schema) },
        // On a safety decline, retry on the server's default fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      const message = await stream.finalMessage();

      if (message.stop_reason === "refusal") {
        return {
          ok: false,
          error: { code: "refusal", message: "رفض النموذج معالجة هذا الطلب. راجع محتوى المصادر.", retryable: false },
        };
      }
      if (message.stop_reason === "max_tokens") {
        return {
          ok: false,
          error: { code: "truncated", message: "توقّف التوليد قبل اكتماله بسبب طول المخرجات. قلّل المصادر وأعد المحاولة.", retryable: true },
        };
      }

      // Validate again with our own schema: never trust unparsed or partially parsed output.
      const parsed = schema.safeParse(message.parsed_output);
      if (!parsed.success) {
        console.error("[ai] output failed schema validation:", parsed.error.issues.slice(0, 3));
        return {
          ok: false,
          error: { code: "invalid_output", message: "أعاد النموذج مخرجات بصيغة غير صالحة. أعد المحاولة.", retryable: true },
        };
      }
      return { ok: true, data: parsed.data, model: message.model };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        return { ok: false, error: { code: "rate_limited", message: "تم تجاوز حد الطلبات مؤقتًا. أعد المحاولة بعد قليل.", retryable: true } };
      }
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        console.error("[ai] credentials rejected");
        return { ok: false, error: { code: "unconfigured", message: "مفتاح الذكاء الاصطناعي غير صالح أو لا يملك صلاحية.", retryable: false } };
      }
      if (error instanceof Anthropic.BadRequestError) {
        console.error("[ai] bad request:", error.message);
        return { ok: false, error: { code: "unavailable", message: "رفضت خدمة الذكاء الاصطناعي الطلب (قد تكون المصادر أكبر من الحد).", retryable: false } };
      }
      if (error instanceof Anthropic.APIError) {
        console.error("[ai] api error:", error.status, error.message);
        return { ok: false, error: { code: "unavailable", message: "خدمة الذكاء الاصطناعي غير متاحة حاليًا. أعد المحاولة.", retryable: true } };
      }
      console.error("[ai] unexpected error:", error);
      return { ok: false, error: { code: "unavailable", message: "تعذّر الاتصال بخدمة الذكاء الاصطناعي. أعد المحاولة.", retryable: true } };
    }
  }
}

/** Returns the configured provider, or null when ANTHROPIC_API_KEY is not set. */
export function getAIProvider(): StructuredAIProvider | null {
  const config = getAIConfig();
  if (!config) return null;
  return new AnthropicProvider(new Anthropic({ apiKey: config.apiKey }), config.model, config.effort);
}

export { AI_UNCONFIGURED };
