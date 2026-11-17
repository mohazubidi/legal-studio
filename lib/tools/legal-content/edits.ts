import { z } from "zod";
import type { SourceReferenceRow } from "@/types/database";
import type { ContentBlock, LegalContent } from "./content";
import { FORMAT_SPECS, roleSpec, SOURCE_ROLE } from "./formats";
import { quoteStillMatches } from "./record";

/**
 * Lawyer edits. The structure is fixed: sections cannot be added, removed or
 * reordered, only their text. Blocks can be edited, removed or added (added
 * blocks are the lawyer's own text).
 */
export const contentEditsSchema = z
  .object({
    title: z.string().max(400),
    firm_name: z.string().max(80),
    attribution: z.string().max(400),
    cards: z
      .array(
        z.object({
          id: z.string().min(1),
          heading: z.string().max(400),
          blocks: z.array(z.object({ id: z.string().min(1).nullable(), text: z.string().max(4000) })).max(12),
        }),
      )
      .max(12),
  })
  .strict();

export type ContentEdits = z.infer<typeof contentEditsSchema>;

export type ApplyResult = { ok: true; content: LegalContent } | { ok: false; message: string };

const same = (a: string, b: string) => a.trim() === b.trim();

/** Applies edits to stored content, re-checking every limit and every quote on the server. */
export function applyContentEdits(
  content: LegalContent,
  edits: ContentEdits,
  references: Pick<SourceReferenceRow, "id" | "source_text">[],
  now: string,
  newId: () => string,
): ApplyResult {
  const spec = FORMAT_SPECS[content.format];
  const title = edits.title.trim();
  if (!title) return { ok: false, message: "العنوان مطلوب." };
  if (title.length > spec.maxTitle) return { ok: false, message: `العنوان أطول من المسموح في هذا القالب (${spec.maxTitle} حرفًا).` };
  const attribution = edits.attribution.trim();
  if (!attribution) return { ok: false, message: "حقل المصدر مطلوب ولا يمكن حذفه." };

  const editable = content.cards.filter((c) => c.role !== SOURCE_ROLE.role);
  if (edits.cards.length !== editable.length || edits.cards.some((c, i) => c.id !== editable[i].id)) {
    return { ok: false, message: "بنية المحتوى ثابتة: لا يمكن إضافة أقسام أو حذفها أو تغيير ترتيبها." };
  }
  const refText = new Map(references.map((r) => [r.id, r.source_text]));

  const cards = [];
  for (const [index, edit] of edits.cards.entries()) {
    const card = editable[index];
    const roleDef = roleSpec(content.format, card.role)!;
    const heading = edit.heading.trim();
    if (heading.length > roleDef.maxHeading) return { ok: false, message: `عنوان قسم «${roleDef.label}» أطول من المسموح (${roleDef.maxHeading} حرفًا).` };

    const byId = new Map(card.blocks.map((b) => [b.id, b]));
    const blocks: ContentBlock[] = [];
    for (const editBlock of edit.blocks) {
      const text = editBlock.text.trim();
      if (!text) continue;
      const original = editBlock.id ? byId.get(editBlock.id) : undefined;
      if (editBlock.id && !original) return { ok: false, message: "تعديل يشير إلى نص غير موجود. حدّث الصفحة وأعد المحاولة." };
      if (!original) {
        blocks.push({ id: newId(), kind: "lawyer", text, reference_ids: [], edited_from: null });
        continue;
      }
      if (same(text, original.text)) {
        blocks.push(original);
        continue;
      }
      if (original.kind === "source_quote") {
        const quotes = original.reference_ids.map((id) => refText.get(id) ?? "").filter(Boolean);
        // Shortening a quote keeps it a quote only if it is still verbatim source text.
        if (quoteStillMatches(text, quotes)) {
          blocks.push({ ...original, text });
          continue;
        }
        blocks.push({ id: original.id, kind: "lawyer", text, reference_ids: [], edited_from: "source_quote" });
        continue;
      }
      blocks.push({ id: original.id, kind: "lawyer", text, reference_ids: [], edited_from: original.kind === "explanation" ? "explanation" : original.edited_from });
    }
    if (blocks.length > roleDef.maxBlocks) return { ok: false, message: `قسم «${roleDef.label}» يتسع لـ ${roleDef.maxBlocks} فقرات على الأكثر.` };
    const length = blocks.reduce((n, b) => n + b.text.length, 0);
    if (length > roleDef.maxBody) return { ok: false, message: `نص قسم «${roleDef.label}» أطول من مساحة القالب (${length} من ${roleDef.maxBody} حرفًا).` };

    cards.push({
      ...card,
      heading,
      heading_by: same(heading, card.heading) ? card.heading_by : ("lawyer" as const),
      blocks,
      missing: !heading && blocks.length === 0,
    });
  }
  const sourceCard = content.cards.find((c) => c.role === SOURCE_ROLE.role);

  return {
    ok: true,
    content: {
      ...content,
      title,
      title_by: same(title, content.title) ? content.title_by : "lawyer",
      brand: { firm_name: edits.firm_name.trim() },
      attribution: { ...content.attribution, display: attribution },
      cards: sourceCard ? [...cards, sourceCard] : cards,
      last_edited_at: now,
    },
  };
}

/** The editable state of stored content (what the editor starts from). */
export function editsFromContent(content: LegalContent): ContentEdits {
  return {
    title: content.title,
    firm_name: content.brand.firm_name,
    attribution: content.attribution.display,
    cards: content.cards
      .filter((c) => c.role !== SOURCE_ROLE.role)
      .map((c) => ({ id: c.id, heading: c.heading, blocks: c.blocks.map((b) => ({ id: b.id, text: b.text })) })),
  };
}
