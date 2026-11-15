import { z } from "zod";
import { sourceSnapshotSchema } from "@/lib/tools/shared/sources";
import { EVIDENCE_TYPES } from "./model-schema";

/**
 * Stored shape of outputs.content for CaseMap outputs (versioned).
 * `provenance`:
 *   source       — at least one citation was verified against the source text
 *   unreferenced — no verifiable source; shown as requiring review, never as fact
 * `supports` / `interpretation` are AI interpretation and are labelled as such.
 */
const ids = z.array(z.string());
const refs = z.array(z.string().uuid());
const provenance = z.enum(["source", "unreferenced"]);

export const caseMapContentSchema = z.object({
  version: z.literal(1),
  kind: z.literal("casemap"),
  generated_at: z.string(),
  model: z.string(),
  sources: z.array(sourceSnapshotSchema),
  parties: z.array(z.object({ id: z.string(), name: z.string(), role: z.string(), provenance, reference_ids: refs })),
  claims: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      claimant_ids: ids,
      respondent_ids: ids,
      provenance,
      reference_ids: refs,
      positions: z.array(z.object({ party_id: z.string(), position: z.string(), provenance, reference_ids: refs })),
    }),
  ),
  events: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      date: z.object({
        text: z.string(),
        calendar: z.enum(["gregorian", "hijri", "unknown"]),
        iso: z.string().nullable(),
        precision: z.enum(["day", "month", "year"]).nullable(),
        converted: z.boolean(),
      }),
      party_ids: ids,
      claim_ids: ids,
      provenance,
      reference_ids: refs,
    }),
  ),
  evidence: z.array(
    z.object({
      id: z.string(),
      evidence_type: z.enum(EVIDENCE_TYPES),
      description: z.string(),
      supports: z.string(),
      claim_ids: ids,
      party_ids: ids,
      provenance,
      reference_ids: refs,
    }),
  ),
  contradictions: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["date", "amount", "fact", "statement"]),
      topic: z.string(),
      statements: z.array(z.object({ id: z.string(), text: z.string(), provenance, reference_ids: refs })),
      interpretation: z.string(),
    }),
  ),
  missing: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["missing", "unclear", "processing_error"]),
      text: z.string(),
      claim_ids: ids,
      reference_ids: refs,
    }),
  ),
  warnings: z.array(z.string()),
});

export type CaseMapContent = z.infer<typeof caseMapContentSchema>;
export type CaseMapParty = CaseMapContent["parties"][number];
export type CaseMapClaim = CaseMapContent["claims"][number];
export type CaseMapEvent = CaseMapContent["events"][number];
export type CaseMapEvidence = CaseMapContent["evidence"][number];
export type CaseMapContradiction = CaseMapContent["contradictions"][number];
export type CaseMapMissing = CaseMapContent["missing"][number];

export const EVIDENCE_TYPE_LABELS: Record<CaseMapEvidence["evidence_type"], string> = {
  contract: "عقد أو اتفاق",
  correspondence: "مراسلات",
  financial: "مستند مالي",
  official_record: "سجل رسمي",
  statement: "إفادة أو أقوال",
  expert: "تقرير خبرة",
  other: "أخرى",
};

export const CONTRADICTION_KIND_LABELS: Record<CaseMapContradiction["kind"], string> = {
  date: "تعارض في التاريخ",
  amount: "تعارض في المبلغ",
  fact: "تعارض في واقعة",
  statement: "تعارض في الأقوال",
};

export const MISSING_KIND_LABELS: Record<CaseMapMissing["kind"], string> = {
  missing: "ناقص",
  unclear: "غير واضح",
  processing_error: "مصدر لم يُعالج",
};

export { UNREFERENCED_LABEL } from "@/lib/tools/shared/labels";

export function parseCaseMapContent(value: unknown): CaseMapContent | null {
  const parsed = caseMapContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
