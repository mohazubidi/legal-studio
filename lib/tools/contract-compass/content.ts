import { z } from "zod";
import { sourceSnapshotSchema } from "@/lib/tools/shared/sources";
import { REVIEW_LABEL_KEYS, type ReviewLabelKey, type TermKey } from "./model-schema";

const refs = z.array(z.string().uuid());
const provenance = z.enum(["source", "unreferenced"]);
const normalizedDate = z.object({
  text: z.string(),
  calendar: z.enum(["gregorian", "hijri", "unknown"]),
  iso: z.string().nullable(),
  precision: z.enum(["day", "month", "year"]).nullable(),
  converted: z.boolean(),
});

/**
 * `status` of a term:
 *   stated      — stated in the contract, with a verified citation
 *   not_stated  — the contract does not state it
 *   unclear     — stated ambiguously (with citations where available)
 *   unverified  — the model said it is stated, but no citation could be verified
 * `clause` is kept only when that clause number appears in the cited text.
 */
const termSchema = z.object({
  status: z.enum(["stated", "not_stated", "unclear", "unverified"]),
  summary: z.string(),
  clause: z.string().nullable(),
  reference_ids: refs,
});

export const contractContentSchema = z.object({
  version: z.literal(1),
  kind: z.literal("contract_compass"),
  generated_at: z.string(),
  model: z.string(),
  contract: z.object({ document_id: z.string().uuid(), file_name: z.string() }),
  sources: z.array(sourceSnapshotSchema),
  /** Configured legal knowledge source; null means definitive legal conclusions are not allowed. */
  knowledge_source: z.string().nullable(),
  parties: z.array(z.object({ id: z.string(), name: z.string(), role: z.string(), provenance, reference_ids: refs })),
  terms: z.object({
    effective_date: termSchema.extend({ date: normalizedDate.nullable() }),
    duration: termSchema,
    renewal: termSchema,
    termination: termSchema,
    confidentiality: termSchema,
    liability: termSchema,
    dispute_resolution: termSchema,
    governing_law: termSchema,
  }),
  notice_periods: z.array(z.object({ id: z.string(), purpose: z.string(), period_text: z.string(), clause: z.string().nullable(), provenance, reference_ids: refs })),
  payments: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      /** Null when the stated amount could not be found in the cited text. */
      amount_text: z.string().nullable(),
      currency: z.string().nullable(),
      due_text: z.string().nullable(),
      due_date: normalizedDate.nullable(),
      clause: z.string().nullable(),
      provenance,
      reference_ids: refs,
    }),
  ),
  obligations: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      responsible_party_ids: z.array(z.string()),
      deadline_text: z.string().nullable(),
      deadline_date: normalizedDate.nullable(),
      clause: z.string().nullable(),
      provenance,
      reference_ids: refs,
    }),
  ),
  review_items: z.array(
    z.object({
      id: z.string(),
      topic: z.string(),
      clause: z.string().nullable(),
      /** AI interpretation. */
      note: z.string(),
      label: z.enum(REVIEW_LABEL_KEYS),
      /** True when a definitive legal conclusion was removed from the note. */
      note_replaced: z.boolean(),
      provenance,
      reference_ids: refs,
    }),
  ),
  missing: z.array(z.object({ id: z.string(), kind: z.enum(["missing", "unclear", "processing_error"]), text: z.string(), reference_ids: refs })),
  warnings: z.array(z.string()),
});

export type ContractContent = z.infer<typeof contractContentSchema>;
export type ContractTerm = ContractContent["terms"][TermKey];
export type ContractObligation = ContractContent["obligations"][number];
export type ContractPayment = ContractContent["payments"][number];
export type ContractReviewItem = ContractContent["review_items"][number];

export const TERM_LABELS: Record<TermKey, string> = {
  effective_date: "تاريخ السريان",
  duration: "مدة العقد",
  renewal: "التجديد",
  termination: "الإنهاء",
  confidentiality: "السرية",
  liability: "المسؤولية",
  dispute_resolution: "تسوية النزاعات",
  governing_law: "القانون الواجب التطبيق",
};

export const TERM_STATUS_LABELS: Record<ContractTerm["status"], string> = {
  stated: "منصوص عليه",
  not_stated: "غير منصوص عليه في العقد",
  unclear: "صياغة غير واضحة",
  unverified: "لم يُتحقق من وروده في النص",
};

/** The only review wording the tool uses. No item is labelled illegal or high risk. */
export const REVIEW_LABELS: Record<ReviewLabelKey, string> = {
  worth_review: "يستحق المراجعة",
  contractual_effect: "قد يترتب عليه أثر تعاقدي",
  wording_check: "صياغة تحتاج تحققًا",
};

export const MISSING_KIND_LABELS: Record<ContractContent["missing"][number]["kind"], string> = {
  missing: "غير منصوص عليه",
  unclear: "غير واضح",
  processing_error: "تعذّرت معالجته",
};

export function parseContractContent(value: unknown): ContractContent | null {
  const parsed = contractContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
