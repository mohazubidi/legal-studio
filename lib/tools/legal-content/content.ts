import { z } from "zod";
import { sourceSnapshotSchema } from "@/lib/tools/shared/sources";
import { CONTENT_FORMATS } from "./formats";

/**
 * Stored content of a legal_content output.
 *
 * Every text block says who wrote it:
 *   source_quote — verbatim text from the supplied material; carries verified references
 *   explanation  — written by the AI to explain the material
 *   lawyer       — written or edited by the lawyer
 * A quote stops being a quote as soon as its text no longer matches the source.
 */
export const BLOCK_KINDS = ["source_quote", "explanation", "lawyer"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

const blockSchema = z.object({
  id: z.string(),
  kind: z.enum(BLOCK_KINDS),
  text: z.string(),
  reference_ids: z.array(z.string()),
  /** For a lawyer block that started as AI text or a quote. */
  edited_from: z.enum(["source_quote", "explanation"]).nullable(),
});

const cardSchema = z.object({
  id: z.string(),
  role: z.string(),
  heading: z.string(),
  heading_by: z.enum(["ai", "lawyer"]),
  blocks: z.array(blockSchema),
  /** The model produced nothing usable for this section. */
  missing: z.boolean(),
});

export const attributionSourceSchema = z.object({
  document_id: z.string().uuid(),
  file_name: z.string(),
  kind_label: z.string(),
});

export const contentSchema = z.object({
  version: z.literal(1),
  kind: z.literal("legal_content"),
  format: z.enum(CONTENT_FORMATS),
  generated_at: z.string(),
  model: z.string(),
  sources: z.array(sourceSnapshotSchema),
  brand: z.object({ firm_name: z.string() }),
  title: z.string(),
  title_by: z.enum(["ai", "lawyer"]),
  cards: z.array(cardSchema),
  attribution: z.object({
    /** Sources the content was produced from (always shown; cannot be removed). */
    sources: z.array(attributionSourceSchema),
    /** How the source is named on the cards; defaults to the file names, editable by the lawyer. */
    display: z.string(),
  }),
  warnings: z.array(z.string()),
  last_edited_at: z.string().nullable(),
});

export type LegalContent = z.infer<typeof contentSchema>;
export type ContentCard = LegalContent["cards"][number];
export type ContentBlock = ContentCard["blocks"][number];

export function parseLegalContent(value: unknown): LegalContent | null {
  const parsed = contentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
