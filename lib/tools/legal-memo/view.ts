import type { Citation, ResultItem } from "@/types/legal";
import type { SourceReferenceRow } from "@/types/database";
import { FACT_CATEGORY_LABELS, MISSING_KIND_LABELS, type MemoContent, type MemoFact } from "./content";
import { numberReferences } from "./prompt";

export interface MemoView {
  summary: ResultItem;
  factGroups: { category: MemoFact["category"]; label: string; items: ResultItem[] }[];
  missing: ResultItem[];
  issues: ResultItem[];
  researchQuestions: ResultItem[];
  citations: Citation[];
  /** Ids referenced by content but absent from the database (should never happen). */
  danglingReferenceIds: string[];
}

/**
 * Maps stored memo content and its source_references into render-ready items.
 * Each citation carries its document, page/section label, excerpt, global
 * number [م n] and a link to the original file.
 */
export function buildMemoView(content: MemoContent, references: SourceReferenceRow[]): MemoView {
  const numbers = numberReferences(content);
  const names = new Map(content.sources.map((source) => [source.document_id, source.file_name]));
  const byId = new Map(references.map((reference) => [reference.id, reference]));
  const dangling = new Set<string>();

  const citationFor = (id: string): Citation | null => {
    const reference = byId.get(id);
    if (!reference) {
      dangling.add(id);
      return null;
    }
    return {
      documentId: reference.document_id,
      documentName: names.get(reference.document_id) ?? "مستند محذوف",
      location: reference.page_or_section ?? undefined,
      excerpt: reference.source_text,
      number: numbers.get(id),
      href: `/api/documents/${reference.document_id}/download`,
    };
  };
  const citations = (ids: string[]) => ids.map(citationFor).filter((c): c is Citation => c !== null);

  const summary: ResultItem = {
    id: "summary",
    type: content.summary.provenance,
    text: content.summary.text,
    citations: citations(content.summary.reference_ids),
    note: content.summary.provenance === "verify" ? "الملخص بلا استشهاد مُتحقَّق منه. يتطلب تحققًا بشريًا." : undefined,
  };

  const factGroups = (Object.keys(FACT_CATEGORY_LABELS) as MemoFact["category"][])
    .map((category) => ({
      category,
      label: FACT_CATEGORY_LABELS[category],
      items: content.facts
        .filter((fact) => fact.category === category)
        .map(
          (fact): ResultItem => ({
            id: fact.id,
            // A "source" fact whose references cannot be resolved is shown as needing verification.
            type: fact.provenance === "source" && citations(fact.reference_ids).length > 0 ? "source" : "verify",
            text: fact.text,
            citations: citations(fact.reference_ids),
            note: fact.note,
          }),
        ),
    }))
    .filter((group) => group.items.length > 0);

  const missing: ResultItem[] = content.missing.map((item) => ({
    id: item.id,
    type: "missing",
    text: `${MISSING_KIND_LABELS[item.kind]}: ${item.text}`,
    citations: citations(item.reference_ids),
  }));

  const issues: ResultItem[] = content.issues.map((issue) => ({
    id: issue.id,
    type: "analysis",
    text: issue.rationale ? `${issue.issue} — ${issue.rationale}` : issue.issue,
    citations: citations(issue.reference_ids),
  }));

  const researchQuestions: ResultItem[] = content.research_questions.map((question) => ({
    id: question.id,
    type: "verify",
    text: question.question,
  }));

  const all = [...numbers.keys()].map(citationFor).filter((c): c is Citation => c !== null);
  return {
    summary,
    factGroups,
    missing,
    issues,
    researchQuestions,
    citations: all.sort((a, b) => (a.number ?? 0) - (b.number ?? 0)),
    danglingReferenceIds: [...dangling],
  };
}
