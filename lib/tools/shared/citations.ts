import type { DocumentSegment } from "@/types/database";
import type { ModelCitation } from "./model-citation";

/** A source as presented to the model: a short id (S1…) mapped to the stored document. */
export interface IndexedSource {
  sourceId: string;
  documentId: string;
  fileName: string;
  segments: DocumentSegment[];
}

export interface VerifiedReference {
  id: string;
  document_id: string;
  segment_id: string;
  page_or_section: string;
  source_text: string;
}

/** Shortest quote accepted as evidence; shorter strings match too easily by chance. */
export const MIN_QUOTE_CHARS = 8;
const MAX_QUOTE_CHARS = 2000;

/**
 * Normalises text for comparison only: Unicode compatibility forms, Arabic
 * diacritics and tatweel, quote marks and whitespace. Words and digits are kept.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, "")
    .replace(/[«»“”"„‟]/g, '"')
    .replace(/[‘’‚‛']/g, "'")
    .replace(/[‌-‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type CitationCheck =
  | { ok: true; source: IndexedSource; segment: DocumentSegment; quote: string }
  | { ok: false; reason: "unknown_source" | "unknown_segment" | "quote_too_short" | "quote_not_found" };

/** Verifies that a citation names a real source and segment and that the quote appears in it. */
export function checkCitation(citation: ModelCitation, sources: Map<string, IndexedSource>): CitationCheck {
  const source = sources.get(citation.source_id.trim());
  if (!source) return { ok: false, reason: "unknown_source" };
  const segment = source.segments.find((item) => item.id === citation.segment_id.trim());
  if (!segment) return { ok: false, reason: "unknown_segment" };

  const quote = citation.quote.trim().replace(/^[«"“]+|[»"”]+$/g, "").trim();
  const needle = normalizeForMatch(quote);
  if (needle.length < MIN_QUOTE_CHARS) return { ok: false, reason: "quote_too_short" };
  if (!normalizeForMatch(segment.text).includes(needle)) return { ok: false, reason: "quote_not_found" };
  return { ok: true, source, segment, quote: quote.slice(0, MAX_QUOTE_CHARS) };
}

/**
 * Collects verified citations into reference rows, de-duplicating identical
 * excerpts. Returns the ids for the statement and how many were rejected.
 */
export class ReferenceCollector {
  readonly references: VerifiedReference[] = [];
  rejected = 0;
  private readonly byKey = new Map<string, string>();

  constructor(
    private readonly sources: Map<string, IndexedSource>,
    private readonly newId: () => string,
  ) {}

  collect(citations: readonly ModelCitation[]): string[] {
    const ids: string[] = [];
    for (const citation of citations) {
      const check = checkCitation(citation, this.sources);
      if (!check.ok) {
        this.rejected += 1;
        continue;
      }
      const key = `${check.source.documentId}|${check.segment.id}|${normalizeForMatch(check.quote)}`;
      let id = this.byKey.get(key);
      if (!id) {
        id = this.newId();
        this.byKey.set(key, id);
        this.references.push({
          id,
          document_id: check.source.documentId,
          segment_id: check.segment.id,
          page_or_section: check.segment.label,
          source_text: check.quote,
        });
      }
      if (!ids.includes(id)) ids.push(id);
    }
    return ids;
  }
}
