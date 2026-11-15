import { z } from "zod";

/** Trimmed optional text: empty strings become null. */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));
}

export const uuidSchema = z.string().uuid();

export const matterStatusSchema = z.enum(["active", "on_hold", "closed"]);
export const outputStatusSchema = z.enum(["draft", "in_review", "reviewed", "approved"]);
export const toolTypeSchema = z.enum([
  "legal_memo",
  "casemap",
  "contract_compass",
  "regdelta",
  "matter_intake",
  "legal_content",
]);

export const matterCreateSchema = z.object({
  matter_name: z.string().trim().min(1, "اسم الملف مطلوب.").max(200),
  matter_type: optionalText(100),
  client_name: optionalText(200),
  description: optionalText(5000),
  status: matterStatusSchema.default("active"),
});

export const matterUpdateSchema = matterCreateSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "لا توجد تغييرات.",
});

/** ISO calendar date (YYYY-MM-DD) that actually exists. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ يجب أن تكون YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "تاريخ غير صالح.");

export const documentMetadataSchema = z.object({
  document_category: optionalText(100),
  document_date: isoDate
    .optional()
    .nullable()
    .or(z.literal("").transform(() => null))
    .transform((value) => value ?? null),
});

export const sourceReferenceInputSchema = z.object({
  document_id: uuidSchema,
  source_text: z.string().trim().min(1).max(10000),
  page_or_section: optionalText(100),
});

export const outputCreateSchema = z.object({
  tool_type: toolTypeSchema,
  title: z.string().trim().min(1).max(300),
  content: z.record(z.string(), z.unknown()).default({}),
  status: outputStatusSchema.default("draft"),
  references: z.array(sourceReferenceInputSchema).max(500).default([]),
});

export type MatterCreateInput = z.input<typeof matterCreateSchema>;
export type MatterUpdateInput = z.input<typeof matterUpdateSchema>;
export type DocumentMetadataInput = z.input<typeof documentMetadataSchema>;
export type OutputCreateInput = z.input<typeof outputCreateSchema>;

/** First validation message, for user-facing errors. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "مدخلات غير صالحة.";
}
