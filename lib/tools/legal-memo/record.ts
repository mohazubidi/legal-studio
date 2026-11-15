import { ReferenceCollector, type IndexedSource, type VerifiedReference } from "./citations";
import { INSUFFICIENT_EVIDENCE, type MemoContent, type MemoSourceSnapshot } from "./content";
import type { MemoAnalysisOutput } from "./model-schema";

export const UNVERIFIED_FACT_NOTE = "لم يُعثر على نص داعم مطابق في المصادر. يتطلب تحققًا بشريًا قبل الاعتماد.";

export interface BuildMemoRecordInput {
  analysis: MemoAnalysisOutput;
  /** Sources sent to the model (processed, with segments). */
  sources: IndexedSource[];
  /** Every source of the matter, including failed or unprocessed ones. */
  snapshot: MemoSourceSnapshot[];
  model: string;
  now: string;
  newId: () => string;
}

export interface MemoRecord {
  content: MemoContent;
  references: VerifiedReference[];
}

const clean = (text: string) => text.trim();
const isInsufficient = (text: string) => !text.trim() || text.includes(INSUFFICIENT_EVIDENCE);

/**
 * Turns validated model output into what is stored: content plus the
 * source_references rows it points to.
 *
 * Trust rules, applied here rather than left to the model:
 *  - a citation counts only if its quote is found in the named segment;
 *  - a fact with no verified citation is never shown as source-derived: it is
 *    downgraded to "requires human verification";
 *  - sources that failed processing become explicit missing-information items;
 *  - empty sections say INSUFFICIENT_EVIDENCE instead of staying silent.
 */
export function buildMemoRecord({ analysis, sources, snapshot, model, now, newId }: BuildMemoRecordInput): MemoRecord {
  const index = new Map(sources.map((source) => [source.sourceId, source]));
  const collector = new ReferenceCollector(index, newId);
  const warnings: string[] = [];

  const summaryText = clean(analysis.matter_summary.text);
  const summaryRefs = collector.collect(analysis.matter_summary.citations);
  const summary: MemoContent["summary"] = isInsufficient(summaryText)
    ? { text: INSUFFICIENT_EVIDENCE, provenance: "missing", reference_ids: [] }
    : { text: summaryText, provenance: summaryRefs.length > 0 ? "source" : "verify", reference_ids: summaryRefs };

  const facts: MemoContent["facts"] = analysis.facts
    .filter((fact) => clean(fact.text) && !isInsufficient(fact.text))
    .map((fact) => {
      const referenceIds = collector.collect(fact.citations);
      return referenceIds.length > 0
        ? { id: newId(), category: fact.category, text: clean(fact.text), provenance: "source" as const, reference_ids: referenceIds }
        : {
            id: newId(),
            category: fact.category,
            text: clean(fact.text),
            provenance: "verify" as const,
            reference_ids: [],
            note: UNVERIFIED_FACT_NOTE,
          };
    });

  const missing: MemoContent["missing"] = analysis.missing_information
    .filter((item) => clean(item.text))
    .map((item) => ({ id: newId(), kind: item.kind, text: clean(item.text), reference_ids: collector.collect(item.citations) }));

  for (const source of snapshot) {
    if (source.processing_status === "failed") {
      missing.push({
        id: newId(),
        kind: "processing_error",
        text: `تعذّرت معالجة المصدر «${source.file_name}»${source.processing_error ? `: ${source.processing_error}` : "."} لم يُستخدم في التحليل.`,
        reference_ids: [],
      });
    } else if (!source.included) {
      missing.push({
        id: newId(),
        kind: "processing_error",
        text: `المصدر «${source.file_name}» لم تكتمل معالجته بعد، ولم يُستخدم في التحليل.`,
        reference_ids: [],
      });
    }
  }

  if (facts.length === 0) {
    missing.unshift({ id: newId(), kind: "missing", text: INSUFFICIENT_EVIDENCE, reference_ids: [] });
  }

  const issues: MemoContent["issues"] = analysis.legal_issues
    .filter((item) => clean(item.issue))
    .map((item) => ({
      id: newId(),
      issue: clean(item.issue),
      rationale: clean(item.rationale),
      reference_ids: collector.collect(item.citations),
    }));

  const relevant_documents = analysis.relevant_documents.flatMap((item) => {
    const source = index.get(item.source_id.trim());
    return source ? [{ document_id: source.documentId, relevance: clean(item.relevance) }] : [];
  });

  const unverified = facts.filter((fact) => fact.provenance === "verify").length;
  if (collector.rejected > 0) {
    warnings.push(`استُبعد ${collector.rejected} استشهادًا لم يُعثر على نصه في المصدر المذكور.`);
  }
  if (unverified > 0) {
    warnings.push(`${unverified} من الوقائع بلا استشهاد مُتحقَّق منه، ووُسمت بأنها تتطلب تحققًا بشريًا.`);
  }
  if (snapshot.some((source) => !source.included)) {
    warnings.push("لم تُستخدم جميع المصادر في التحليل. راجع قسم المعلومات الناقصة.");
  }

  return {
    content: {
      version: 1,
      kind: "legal_memo",
      generated_at: now,
      model,
      sources: snapshot,
      summary,
      facts,
      missing,
      issues,
      research_questions: analysis.research_questions
        .filter((item) => clean(item.question))
        .map((item) => ({ id: newId(), question: clean(item.question) })),
      relevant_documents,
      analysis_structure: analysis.analysis_structure
        .filter((section) => clean(section.heading))
        .map((section) => ({ heading: clean(section.heading), points: section.points.map(clean).filter(Boolean) })),
      warnings,
      draft: null,
    },
    references: collector.references,
  };
}
