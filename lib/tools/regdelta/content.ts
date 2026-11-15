import { z } from "zod";
import { sourceSnapshotSchema } from "@/lib/tools/shared/sources";
import { AI_CHANGE_TYPES, type AiChangeType } from "./model-schema";
import type { DetectedType } from "./compare";

export const DETECTED_TYPES = ["added", "removed", "modified", "renumbered", "deadline", "amount", "definition"] as const;

const side = z.object({
  provision_id: z.string(),
  label: z.string(),
  number: z.string().nullable(),
  location: z.string(),
  /** Verbatim provision text from the document. Never edited, never model-written. */
  text: z.string(),
  reference_id: z.string().uuid(),
});

const documentMeta = z.object({ document_id: z.string().uuid(), file_name: z.string(), numbered: z.boolean(), provision_count: z.number().int() });

export const regDeltaContentSchema = z.object({
  version: z.literal(1),
  kind: z.literal("regdelta"),
  generated_at: z.string(),
  model: z.string(),
  documents: z.object({ previous: documentMeta, next: documentMeta }),
  sources: z.array(sourceSnapshotSchema),
  unchanged: z.array(z.object({ previous: z.string(), next: z.string() })),
  changes: z.array(
    z.object({
      id: z.string(),
      /** Derived from the text by the server. */
      detected_types: z.array(z.enum(DETECTED_TYPES)),
      /** Suggested by the model; shown separately and editable. */
      ai_types: z.array(z.enum(AI_CHANGE_TYPES)),
      previous: side.nullable(),
      next: side.nullable(),
      match: z.object({ method: z.enum(["number", "similarity"]), similarity: z.number(), confidence: z.enum(["high", "medium", "low"]) }).nullable(),
      /** Server-written note whenever matching is uncertain. */
      uncertainty: z.string().nullable(),
      /** AI interpretation (editable). */
      summary: z.string(),
      significance: z.string(),
      match_assessment: z.string(),
      excluded: z.boolean(),
      edited: z.boolean(),
    }),
  ),
  impacts: z.array(z.object({ id: z.string(), area: z.string(), description: z.string(), change_ids: z.array(z.string()), edited: z.boolean() })),
  checklist: z.array(z.object({ id: z.string(), item: z.string(), change_ids: z.array(z.string()), edited: z.boolean() })),
  warnings: z.array(z.string()),
  last_edited_at: z.string().nullable(),
});

export type RegDeltaContent = z.infer<typeof regDeltaContentSchema>;
export type RegDeltaChange = RegDeltaContent["changes"][number];

export const DETECTED_TYPE_LABELS: Record<DetectedType, string> = {
  added: "حكم مضاف",
  removed: "حكم محذوف",
  modified: "حكم معدّل",
  renumbered: "إعادة ترقيم",
  deadline: "تغيّر في المهل",
  amount: "تغيّر في المبالغ أو الحدود",
  definition: "تغيّر في التعريفات",
};

export const AI_TYPE_LABELS: Record<AiChangeType, string> = {
  responsibility: "تغيّر في المسؤوليات",
  procedural: "تغيّر في المتطلبات الإجرائية",
  deadline: "تغيّر في المهل",
  amount: "تغيّر في المبالغ أو الحدود",
  definition: "تغيّر في التعريفات",
  scope: "تغيّر في النطاق",
  other: "أخرى",
};

export const CONFIDENCE_LABELS = { high: "مطابقة قوية", medium: "مطابقة متوسطة", low: "مطابقة ضعيفة" } as const;

export function parseRegDeltaContent(value: unknown): RegDeltaContent | null {
  const parsed = regDeltaContentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
