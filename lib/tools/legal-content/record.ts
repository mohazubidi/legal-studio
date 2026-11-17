import { normalizeForMatch, ReferenceCollector, type IndexedSource, type VerifiedReference } from "@/lib/tools/shared/citations";
import { SOURCE_KIND_LABELS } from "@/lib/tools/shared/labels";
import type { SourceSnapshot } from "@/lib/tools/shared/sources";
import type { SourceKind } from "@/types/database";
import type { ContentBlock, ContentCard, LegalContent } from "./content";
import { FORMAT_SPECS, SOURCE_ROLE, type ContentFormat, type RoleSpec } from "./formats";
import { emptyStats, guardAiText, guardWarnings } from "./guard";
import type { ContentModelOutput } from "./model-schema";

export interface BuildContentInput {
  format: ContentFormat;
  output: ContentModelOutput;
  sources: IndexedSource[];
  snapshot: SourceSnapshot[];
  firmName: string;
  model: string;
  now: string;
  newId: () => string;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** The attribution line shown on every card: the supplied material by name, never invented. */
export function defaultAttribution(sources: LegalContent["attribution"]["sources"]): string {
  return sources.map((s) => `${s.file_name.replace(/\.[A-Za-z0-9]{1,5}$/, "")} (${s.kind_label})`).join("؛ ");
}

/**
 * Builds the stored content from validated model output:
 *  - sections follow the format's fixed order; missing ones are flagged, extra ones dropped;
 *  - a "source_quote" is kept only if its text appears verbatim in the cited segment;
 *  - AI-written text loses sentences with advice, definitive conclusions, claims of legal
 *    effect, or numbers / instruments that the supplied text does not contain;
 *  - the source section and the attribution come from the sources, not from the model.
 */
export function buildContentRecord(input: BuildContentInput): { content: LegalContent; references: VerifiedReference[] } {
  const spec = FORMAT_SPECS[input.format];
  const sourceMap = new Map(input.sources.map((s) => [s.sourceId, s]));
  const collector = new ReferenceCollector(sourceMap, input.newId);
  const sourceText = input.sources.flatMap((s) => s.segments.map((seg) => seg.text)).join("\n");
  const stats = emptyStats();
  let rejectedQuotes = 0;
  let missingSections = 0;
  let droppedSections = 0;
  let trimmed = 0;
  let rejectedCitations = 0;

  const fit = (text: string, max: number) => {
    if (text.length > max) trimmed += 1;
    return clip(text, max);
  };

  const buildBlocks = (raw: ContentModelOutput["cards"][number]["blocks"], roleSpec: RoleSpec): ContentBlock[] => {
    const blocks: ContentBlock[] = [];
    let budget = roleSpec.maxBody;
    for (const block of raw) {
      if (blocks.length >= roleSpec.maxBlocks || budget <= 0) break;
      const text = block.text.trim().replace(/^[«"“]+|[»"”]+$/g, "").trim();
      if (!text) continue;
      if (block.kind === "source_quote") {
        if (roleSpec.quote === "none") continue;
        // The quote is the block text itself: it must appear in a cited segment.
        const ids = collector.collect(block.citations.map((c) => ({ ...c, quote: text })));
        if (ids.length === 0 || text.length > budget) {
          rejectedQuotes += 1;
          continue;
        }
        blocks.push({ id: input.newId(), kind: "source_quote", text, reference_ids: ids, edited_from: null });
        budget -= text.length;
        continue;
      }
      const cleaned = guardAiText(text, sourceText, stats);
      if (!cleaned) continue;
      const before = collector.rejected;
      const ids = collector.collect(block.citations);
      rejectedCitations += collector.rejected - before;
      const kept = fit(cleaned, budget);
      blocks.push({ id: input.newId(), kind: "explanation", text: kept, reference_ids: ids, edited_from: null });
      budget -= kept.length;
    }
    return blocks;
  };

  const buildCard = (raw: ContentModelOutput["cards"][number] | undefined, roleSpec: RoleSpec): ContentCard => {
    const heading = raw ? fit(guardAiText(raw.heading, sourceText, stats), roleSpec.maxHeading) : "";
    const blocks = raw ? buildBlocks(raw.blocks, roleSpec) : [];
    const missing = !heading && blocks.length === 0;
    if (missing) missingSections += 1;
    return { id: input.newId(), role: roleSpec.role, heading, heading_by: "ai", blocks, missing };
  };

  const known = new Set(spec.roles.map((r) => r.role));
  droppedSections = input.output.cards.filter((c) => !known.has(c.role.trim())).length;
  const byRole = (role: string) => input.output.cards.filter((c) => c.role.trim() === role);

  const cards: ContentCard[] = [];
  for (const roleSpec of spec.roles) {
    if (spec.repeat?.role === roleSpec.role) {
      const raws = byRole(roleSpec.role).slice(0, spec.repeat.max);
      droppedSections += Math.max(0, byRole(roleSpec.role).length - spec.repeat.max);
      for (const raw of raws) cards.push(buildCard(raw, roleSpec));
      for (let i = raws.length; i < spec.repeat.min; i += 1) cards.push(buildCard(undefined, roleSpec));
    } else {
      const raws = byRole(roleSpec.role);
      droppedSections += Math.max(0, raws.length - 1);
      cards.push(buildCard(raws[0], roleSpec));
    }
  }
  // The source section: built from what was cited, always last.
  cards.push({ id: input.newId(), role: SOURCE_ROLE.role, heading: SOURCE_ROLE.label, heading_by: "ai", blocks: [], missing: false });

  // Every included source is attributed, whether or not it was quoted.
  const attributionSources = input.snapshot
    .filter((s) => s.included)
    .map((s) => ({ document_id: s.document_id, file_name: s.file_name, kind_label: SOURCE_KIND_LABELS[s.source_kind as SourceKind] ?? s.source_kind }));

  const title = fit(guardAiText(input.output.title, sourceText, stats), spec.maxTitle);

  const warnings: string[] = [];
  if (rejectedQuotes > 0) warnings.push(`استُبعد ${rejectedQuotes} اقتباسًا لم يُعثر عليه حرفيًا في النص المُدخل.`);
  if (rejectedCitations > 0) warnings.push(`استُبعدت ${rejectedCitations} إحالة لم يُتحقق منها.`);
  warnings.push(...guardWarnings(stats));
  if (missingSections > 0) warnings.push(`${missingSections} قسمًا بلا محتوى صالح؛ أكمله يدويًا قبل الاعتماد.`);
  if (droppedSections > 0) warnings.push(`حُذف ${droppedSections} قسمًا خارج بنية القالب.`);
  if (trimmed > 0) warnings.push(`اختُصر ${trimmed} نصًا ليتسع في مساحة القالب.`);
  for (const s of input.snapshot.filter((s) => !s.included)) warnings.push(`لم يُستخدم «${s.file_name}» لأنه لم يُعالج.`);
  if (!cards.some((c) => c.blocks.some((b) => b.kind === "source_quote"))) {
    warnings.push("لا يتضمن المحتوى أي اقتباس متحقق منه من النص المُدخل.");
  }

  return {
    content: {
      version: 1,
      kind: "legal_content",
      format: input.format,
      generated_at: input.now,
      model: input.model,
      sources: input.snapshot,
      brand: { firm_name: input.firmName.trim().slice(0, 80) },
      title,
      title_by: "ai",
      cards,
      attribution: { sources: attributionSources, display: defaultAttribution(attributionSources) },
      warnings,
      last_edited_at: null,
    },
    references: collector.references,
  };
}

/** True when the block text still matches the quoted source text (ignoring spacing and marks). */
export function quoteStillMatches(text: string, quotes: string[]): boolean {
  const needle = normalizeForMatch(text);
  return needle.length > 0 && quotes.some((q) => normalizeForMatch(q).includes(needle));
}
