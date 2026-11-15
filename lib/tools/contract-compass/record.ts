import { ReferenceCollector, type IndexedSource, type VerifiedReference } from "@/lib/tools/shared/citations";
import { normalizeStatedDate } from "@/lib/tools/shared/dates";
import type { StatedDate } from "@/lib/tools/shared/model-date";
import type { SourceSnapshot } from "@/lib/tools/shared/sources";
import { TERM_LABELS, type ContractContent, type ContractTerm } from "./content";
import { TERM_KEYS, type ContractOutput, type TermKey } from "./model-schema";
import { amountAppears, appearsIn, clauseAppears, containsDefinitiveConclusion, NEUTRALIZED_NOTE } from "./verify";

export interface BuildContractInput {
  output: ContractOutput;
  /** The contract, indexed as a single source. */
  source: IndexedSource;
  snapshot: SourceSnapshot[];
  model: string;
  now: string;
  newId: () => string;
  /** Configured legal knowledge source; null (the default) forbids definitive conclusions. */
  knowledgeSource?: string | null;
}

const clean = (text: string) => text.trim();

/**
 * Builds stored content from validated model output. Beyond citation checks:
 *  - a clause number is kept only if it appears in the cited text;
 *  - an amount, date or deadline is kept only if it appears in the cited text;
 *  - a term reported as stated without a verifiable citation becomes `unverified`,
 *    except governing law, which is never shown unless explicitly cited;
 *  - review notes that state a definitive legal conclusion are replaced, since
 *    no legal knowledge source supports such conclusions.
 */
export function buildContractRecord({ output, source, snapshot, model, now, newId, knowledgeSource = null }: BuildContractInput): {
  content: ContractContent;
  references: VerifiedReference[];
} {
  const collector = new ReferenceCollector(new Map([[source.sourceId, source]]), newId);
  const segmentText = new Map(source.segments.map((segment) => [segment.id, segment.text]));
  let droppedValues = 0;
  let neutralized = 0;

  /** The full text of the segments behind the given references (clause headings often sit outside the quote). */
  const citedText = (ids: string[]) =>
    collector.references
      .filter((ref) => ids.includes(ref.id))
      .map((ref) => segmentText.get(ref.segment_id) ?? ref.source_text)
      .join("\n");

  const keepClause = (clauseRef: string, ids: string[]) => {
    if (!clean(clauseRef)) return null;
    if (ids.length > 0 && clauseAppears(clauseRef, citedText(ids))) return clean(clauseRef);
    droppedValues += 1;
    return null;
  };
  const keepText = (value: string, ids: string[], check: (v: string, t: string) => boolean = appearsIn) => {
    if (!clean(value)) return null;
    if (ids.length > 0 && check(value, citedText(ids))) return clean(value);
    droppedValues += 1;
    return null;
  };
  const keepDate = (date: StatedDate, ids: string[]) => {
    if (date.calendar === "unknown" || !clean(date.text)) return null;
    if (ids.length > 0 && appearsIn(date.text, citedText(ids))) return normalizeStatedDate(date);
    droppedValues += 1;
    return null;
  };

  const partyIds = new Map<string, string>();
  const parties: ContractContent["parties"] = [];
  for (const party of output.parties) {
    const key = clean(party.key);
    if (!key || !clean(party.name) || partyIds.has(key)) continue;
    const id = newId();
    partyIds.set(key, id);
    const ids = collector.collect(party.citations);
    parties.push({ id, name: clean(party.name), role: clean(party.role), provenance: ids.length ? "source" : "unreferenced", reference_ids: ids });
  }

  const buildTerm = (key: TermKey): ContractTerm => {
    const raw = output.terms[key];
    const ids = collector.collect(raw.citations);
    const summary = clean(raw.summary);
    if (raw.status === "not_stated") return { status: "not_stated", summary: "", clause: null, reference_ids: [] };
    if (ids.length === 0) {
      // Never show a governing law (or any stated term) the contract text does not support.
      if (key === "governing_law") return { status: "not_stated", summary: "", clause: null, reference_ids: [] };
      return { status: raw.status === "unclear" ? "unclear" : "unverified", summary, clause: null, reference_ids: [] };
    }
    return { status: raw.status, summary, clause: keepClause(raw.clause_ref, ids), reference_ids: ids };
  };

  const effective = buildTerm("effective_date");
  const terms = {
    ...(Object.fromEntries(TERM_KEYS.filter((k) => k !== "effective_date").map((key) => [key, buildTerm(key)])) as Omit<
      ContractContent["terms"],
      "effective_date"
    >),
    effective_date: { ...effective, date: effective.status === "stated" ? keepDate(output.terms.effective_date.date, effective.reference_ids) : null },
  };

  const notice_periods: ContractContent["notice_periods"] = output.notice_periods
    .filter((item) => clean(item.purpose) || clean(item.period_text))
    .flatMap((item) => {
      const ids = collector.collect(item.citations);
      const period = keepText(item.period_text, ids);
      // A notice period with no verifiable duration is not shown as one.
      if (!period) return [];
      return [{ id: newId(), purpose: clean(item.purpose), period_text: period, clause: keepClause(item.clause_ref, ids), provenance: "source" as const, reference_ids: ids }];
    });

  const payments: ContractContent["payments"] = output.payments
    .filter((item) => clean(item.description))
    .map((item) => {
      const ids = collector.collect(item.citations);
      const amount = keepText(item.amount_text, ids, amountAppears);
      return {
        id: newId(),
        description: clean(item.description),
        amount_text: amount,
        currency: amount ? keepText(item.currency, ids) : null,
        due_text: keepText(item.due_text, ids),
        due_date: keepDate(item.due_date, ids),
        clause: keepClause(item.clause_ref, ids),
        provenance: ids.length ? "source" : "unreferenced",
        reference_ids: ids,
      };
    });

  const obligations: ContractContent["obligations"] = output.obligations
    .filter((item) => clean(item.description))
    .map((item) => {
      const ids = collector.collect(item.citations);
      return {
        id: newId(),
        description: clean(item.description),
        responsible_party_ids: [...new Set(item.responsible_party_keys.flatMap((key) => partyIds.get(clean(key)) ?? []))],
        deadline_text: keepText(item.deadline_text, ids),
        deadline_date: keepDate(item.deadline_date, ids),
        clause: keepClause(item.clause_ref, ids),
        provenance: ids.length ? "source" : "unreferenced",
        reference_ids: ids,
      };
    });

  const review_items: ContractContent["review_items"] = output.review_items
    .filter((item) => clean(item.topic))
    .map((item) => {
      const ids = collector.collect(item.citations);
      const definitive = !knowledgeSource && (containsDefinitiveConclusion(item.note) || containsDefinitiveConclusion(item.topic));
      if (definitive) neutralized += 1;
      return {
        id: newId(),
        topic: definitive && containsDefinitiveConclusion(item.topic) ? "بند يستحق المراجعة" : clean(item.topic),
        clause: keepClause(item.clause_ref, ids),
        note: definitive ? NEUTRALIZED_NOTE : clean(item.note),
        label: definitive ? "wording_check" : item.label,
        note_replaced: definitive,
        provenance: ids.length ? "source" : "unreferenced",
        reference_ids: ids,
      };
    });

  const missing: ContractContent["missing"] = output.missing_information
    .filter((item) => clean(item.text))
    .map((item) => ({ id: newId(), kind: item.kind, text: clean(item.text), reference_ids: collector.collect(item.citations) }));
  for (const key of TERM_KEYS) {
    if (terms[key].status === "unverified") {
      missing.push({ id: newId(), kind: "unclear", text: `لم يُعثر في نص العقد على ما يؤيد ما استُخرج بشأن «${TERM_LABELS[key]}». يتطلب تحققًا.`, reference_ids: [] });
    }
  }
  for (const item of snapshot) {
    if (!item.included) {
      missing.push({ id: newId(), kind: "processing_error", text: `تعذّرت معالجة «${item.file_name}»${item.processing_error ? `: ${item.processing_error}` : "."}`, reference_ids: [] });
    }
  }

  const warnings: string[] = [];
  if (collector.rejected > 0) warnings.push(`استُبعد ${collector.rejected} استشهادًا لم يُعثر على نصه في العقد.`);
  if (droppedValues > 0) warnings.push(`حُذفت ${droppedValues} قيمة (رقم بند أو مبلغ أو تاريخ أو مهلة) لم تُوجد في النص المستشهد به.`);
  if (neutralized > 0) warnings.push(`استُبدل ${neutralized} وصفًا قاطعًا بصياغة مهنية، لعدم وجود مصدر معرفة قانونية مهيأ.`);
  const unreferenced = [...parties, ...obligations, ...payments].filter((item) => item.provenance === "unreferenced").length;
  if (unreferenced > 0) warnings.push(`${unreferenced} عنصرًا بلا مصدر مُتحقَّق منه، ووُسم بأنه يتطلب مراجعة.`);

  return {
    content: {
      version: 1,
      kind: "contract_compass",
      generated_at: now,
      model,
      contract: { document_id: source.documentId, file_name: source.fileName },
      sources: snapshot,
      knowledge_source: knowledgeSource,
      parties,
      terms,
      notice_periods,
      payments,
      obligations,
      review_items,
      missing,
      warnings,
    },
    references: collector.references,
  };
}
