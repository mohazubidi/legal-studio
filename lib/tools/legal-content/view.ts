import type { SourceReferenceRow } from "@/types/database";
import type { BlockKind, LegalContent } from "./content";
import { CANVAS, CONTENT_DISCLAIMER, type CanvasTokens } from "./design";
import { FORMAT_SPECS, roleSpec, SOURCE_ROLE, type FormatSpec } from "./formats";

export interface ViewBlock {
  id: string;
  kind: BlockKind;
  text: string;
  /** For quotes: where the text comes from ("file · page 2"). */
  citation: string | null;
}

export interface ViewCard {
  id: string;
  role: string;
  kicker: string;
  heading: string;
  blocks: ViewBlock[];
  isSource: boolean;
  missing: boolean;
  /** Source card only: each quoted location. */
  sourceLines: string[];
}

export interface ContentView {
  spec: FormatSpec;
  canvas: CanvasTokens;
  title: string;
  firmName: string;
  attribution: string;
  cards: ViewCard[];
}

const fileLabel = (name: string) => name.replace(/\.[A-Za-z0-9]{1,5}$/, "");

/** Resolves references into what a card shows. Quotes without a stored reference lose their citation, never gain one. */
export function buildContentView(content: LegalContent, references: Pick<SourceReferenceRow, "id" | "document_id" | "page_or_section">[]): ContentView {
  const spec = FORMAT_SPECS[content.format];
  const names = new Map(content.sources.map((s) => [s.document_id, fileLabel(s.file_name)]));
  const refs = new Map(references.map((r) => [r.id, r]));
  const citationOf = (ids: string[]) => {
    const ref = ids.map((id) => refs.get(id)).find(Boolean);
    if (!ref) return null;
    return [names.get(ref.document_id) ?? "مصدر", ref.page_or_section].filter(Boolean).join(" · ");
  };
  const quoted = new Set<string>();
  const cards = content.cards.map((card): ViewCard => {
    const blocks = card.blocks.map((b) => {
      const citation = b.kind === "source_quote" ? citationOf(b.reference_ids) : null;
      if (citation) quoted.add(citation);
      return { id: b.id, kind: b.kind, text: b.text, citation };
    });
    return {
      id: card.id,
      role: card.role,
      kicker: roleSpec(content.format, card.role)?.label ?? card.role,
      heading: card.heading,
      blocks,
      isSource: card.role === SOURCE_ROLE.role,
      missing: card.missing,
      sourceLines: [],
    };
  });
  for (const card of cards) if (card.isSource) card.sourceLines = [...quoted];
  return { spec, canvas: CANVAS[spec.layout], title: content.title, firmName: content.brand.firm_name, attribution: content.attribution.display, cards };
}

/**
 * Plain-text version of the content (for LinkedIn captions, email, or pasting
 * elsewhere). Quotes stay in guillemets with their location; the source and the
 * disclaimer are always included.
 */
export function contentToText(view: ContentView): string {
  const lines: string[] = [view.title, ""];
  for (const card of view.cards) {
    if (card.isSource) continue;
    if (card.heading) lines.push(card.heading);
    for (const block of card.blocks) lines.push(block.kind === "source_quote" ? `«${block.text}»${block.citation ? ` (${block.citation})` : ""}` : block.text);
    lines.push("");
  }
  lines.push(`المصدر: ${view.attribution}`);
  const quoted = view.cards.find((c) => c.isSource)?.sourceLines ?? [];
  if (quoted.length > 0) lines.push(`المواضع المقتبسة: ${quoted.join("؛ ")}`);
  if (view.firmName) lines.push(view.firmName);
  lines.push(CONTENT_DISCLAIMER);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/** Safe download name for a content export. */
export function exportFileName(title: string, extension: string): string {
  const base = title.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "legal-content";
  return `${base}.${extension}`;
}
