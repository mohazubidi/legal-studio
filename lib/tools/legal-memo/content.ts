import { z } from "zod";
import { sourceSnapshotSchema } from "@/lib/tools/shared/sources";
import { FACT_CATEGORIES } from "./model-schema";

/** Mandatory wording when the sources do not support an answer. */
export const INSUFFICIENT_EVIDENCE = "لا تتوفر معلومات كافية في المستندات المرفوعة";

/**
 * Shape of outputs.content for legal_memo outputs (versioned). Every factual
 * statement points at source_references rows by id; provenance says how much
 * the statement can be trusted, and the UI renders it with its own label.
 */
const referenceIds = z.array(z.string().uuid());

export const memoSourceSnapshotSchema = sourceSnapshotSchema;

export const memoContentSchema = z.object({
  version: z.literal(1),
  kind: z.literal("legal_memo"),
  generated_at: z.string(),
  model: z.string(),
  sources: z.array(memoSourceSnapshotSchema),
  summary: z.object({
    text: z.string(),
    provenance: z.enum(["source", "verify", "missing"]),
    reference_ids: referenceIds,
  }),
  facts: z.array(
    z.object({
      id: z.string(),
      category: z.enum(FACT_CATEGORIES),
      text: z.string(),
      /** `source` only when at least one citation was verified against the source text. */
      provenance: z.enum(["source", "verify"]),
      reference_ids: referenceIds,
      note: z.string().optional(),
    }),
  ),
  missing: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["missing", "unclear", "contradictory", "processing_error"]),
      text: z.string(),
      reference_ids: referenceIds,
    }),
  ),
  issues: z.array(
    z.object({ id: z.string(), issue: z.string(), rationale: z.string(), reference_ids: referenceIds }),
  ),
  research_questions: z.array(z.object({ id: z.string(), question: z.string() })),
  relevant_documents: z.array(z.object({ document_id: z.string().uuid(), relevance: z.string() })),
  analysis_structure: z.array(z.object({ heading: z.string(), points: z.array(z.string()) })),
  warnings: z.array(z.string()),
  draft: z
    .object({
      text: z.string().max(200_000),
      generated_at: z.string(),
      model: z.string(),
      edited: z.boolean(),
      updated_at: z.string(),
    })
    .nullable(),
});

export type MemoContent = z.infer<typeof memoContentSchema>;
export type MemoFact = MemoContent["facts"][number];
export type MemoSourceSnapshot = z.infer<typeof memoSourceSnapshotSchema>;

export const FACT_CATEGORY_LABELS: Record<MemoFact["category"], string> = {
  party: "الأطراف",
  date: "التواريخ",
  amount: "المبالغ",
  event: "الوقائع والأحداث",
  relationship: "العلاقات التعاقدية",
  claim: "المطالبات",
  response: "الردود والدفوع",
  referenced_document: "المستندات المشار إليها",
};

export const MISSING_KIND_LABELS: Record<MemoContent["missing"][number]["kind"], string> = {
  missing: "ناقص",
  unclear: "غير واضح",
  contradictory: "متعارض",
  processing_error: "تعذّرت معالجته",
};

export function parseMemoContent(value: unknown): MemoContent | null {
  const parsed = memoContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
