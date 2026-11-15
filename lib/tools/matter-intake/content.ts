import { z } from "zod";
import { sourceSnapshotSchema } from "@/lib/tools/shared/sources";
import { ANSWER_TYPES } from "./model-schema";

/**
 * `status` of a brief field:
 *   stated        — the client said it (verified quote)
 *   inferred      — organised or inferred by AI; not stated as such
 *   unclear       — the client's account is ambiguous
 *   not_provided  — the client did not provide it (value is always empty)
 *   confirmed     — set or confirmed by the reviewing lawyer
 */
export const FIELD_STATUSES = ["stated", "inferred", "unclear", "not_provided", "confirmed"] as const;
export type FieldStatus = (typeof FIELD_STATUSES)[number];

const refs = z.array(z.string().uuid());
const status = z.enum(FIELD_STATUSES);
const date = z.object({
  text: z.string(),
  calendar: z.enum(["gregorian", "hijri", "unknown"]),
  iso: z.string().nullable(),
  precision: z.enum(["day", "month", "year"]).nullable(),
  converted: z.boolean(),
});
const field = z.object({ value: z.string(), status, reference_ids: refs, note: z.string().nullable() });

export const FIELD_KEYS = ["client", "relationship", "matter_type", "requested_outcome"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export const intakeContentSchema = z.object({
  version: z.literal(1),
  kind: z.literal("matter_intake"),
  generated_at: z.string(),
  model: z.string(),
  sources: z.array(sourceSnapshotSchema),
  /** AI-organised summary (the client's words are in the cited references). */
  summary: z.object({ text: z.string(), reference_ids: refs }),
  fields: z.object({ client: field, relationship: field, matter_type: field, requested_outcome: field }),
  other_parties: z.array(z.object({ id: z.string(), name: z.string(), role: z.string(), status, reference_ids: refs })),
  key_events: z.array(z.object({ id: z.string(), description: z.string(), date: date.nullable(), status, reference_ids: refs })),
  dates: z.array(z.object({ id: z.string(), label: z.string(), date, status, reference_ids: refs })),
  amounts: z.array(z.object({ id: z.string(), label: z.string(), amount_text: z.string(), currency: z.string().nullable(), status, reference_ids: refs })),
  documents_received: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      /** uploaded = a file in this intake; mentioned = the client says it exists. */
      origin: z.enum(["uploaded", "mentioned"]),
      provided: z.boolean(),
      document_id: z.string().uuid().nullable(),
      reference_ids: refs,
    }),
  ),
  missing_information: z.array(z.object({ id: z.string(), text: z.string() })),
  missing_documents: z.array(z.object({ id: z.string(), document: z.string(), reason: z.string() })),
  contradictions: z.array(z.object({ id: z.string(), topic: z.string(), statements: z.array(z.object({ text: z.string(), reference_ids: refs })) })),
  clarification_questions: z.array(z.object({ id: z.string(), question: z.string(), reason: z.string() })),
  questionnaire: z.array(
    z.object({ id: z.string(), section: z.string(), questions: z.array(z.object({ id: z.string(), question: z.string(), purpose: z.string(), answer_type: z.enum(ANSWER_TYPES) })) }),
  ),
  warnings: z.array(z.string()),
  last_edited_at: z.string().nullable(),
  /** Set when the brief was used to create the matter. */
  finalized: z.object({ matter_id: z.string().uuid(), at: z.string() }).nullable(),
});

export type IntakeContent = z.infer<typeof intakeContentSchema>;
export type IntakeField = IntakeContent["fields"][FieldKey];

export const FIELD_LABELS: Record<FieldKey, string> = {
  client: "العميل",
  relationship: "العلاقة بين الأطراف",
  matter_type: "نوع المسألة",
  requested_outcome: "النتيجة التي يطلبها العميل",
};

export const STATUS_LABELS: Record<FieldStatus, string> = {
  stated: "ذكره العميل",
  inferred: "مستنتج — يتطلب تأكيدًا",
  unclear: "غير واضح",
  not_provided: "لم يُقدَّم",
  confirmed: "أكّده المحامي",
};

export const ANSWER_TYPE_LABELS: Record<(typeof ANSWER_TYPES)[number], string> = {
  text: "إجابة نصية",
  date: "تاريخ",
  amount: "مبلغ",
  yes_no: "نعم / لا",
  document: "مستند",
};

export const NOT_PROVIDED = "لم يُقدَّم";

export function parseIntakeContent(value: unknown): IntakeContent | null {
  const parsed = intakeContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
