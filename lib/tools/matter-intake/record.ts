import { ReferenceCollector, type IndexedSource, type VerifiedReference } from "@/lib/tools/shared/citations";
import { normalizeStatedDate } from "@/lib/tools/shared/dates";
import { containsDefinitiveConclusion, NEUTRALIZED_NOTE, stripLegalAdvice } from "@/lib/tools/shared/language-guard";
import type { StatedDate } from "@/lib/tools/shared/model-date";
import type { SourceSnapshot } from "@/lib/tools/shared/sources";
import { amountAppears, appearsIn } from "@/lib/tools/shared/value-check";
import { FIELD_KEYS, type FieldStatus, type IntakeContent, type IntakeField } from "./content";
import type { IntakeBriefOutput } from "./model-schema";

export const UNSUPPORTED_NOTE = "لم يُعثر على ما يؤيده في كلام العميل؛ عومل كاستنتاج يتطلب تأكيدًا.";

export interface BuildIntakeInput {
  output: IntakeBriefOutput;
  sources: IndexedSource[];
  snapshot: SourceSnapshot[];
  model: string;
  now: string;
  newId: () => string;
}

const clean = (text: string) => text.trim();

/**
 * Builds the Matter Brief from validated model output:
 *  - "stated" requires a verified quote of the client's words, otherwise it becomes "inferred";
 *  - an empty value is always "not_provided", and "not_provided" never carries a value;
 *  - dates and amounts are kept only if they appear in the cited text;
 *  - uploaded files are listed from the sources themselves, not from the model;
 *  - sentences giving legal advice are removed from AI-written text.
 */
export function buildIntakeRecord({ output, sources, snapshot, model, now, newId }: BuildIntakeInput): { content: IntakeContent; references: VerifiedReference[] } {
  const collector = new ReferenceCollector(new Map(sources.map((s) => [s.sourceId, s])), newId);
  const segmentText = new Map(sources.flatMap((s) => s.segments.map((seg) => [`${s.documentId}|${seg.id}`, seg.text] as const)));
  const citedText = (ids: string[]) =>
    collector.references
      .filter((ref) => ids.includes(ref.id))
      .map((ref) => segmentText.get(`${ref.document_id}|${ref.segment_id}`) ?? ref.source_text)
      .join("\n");
  let advice = 0;
  let dropped = 0;
  let downgraded = 0;

  const guard = (text: string) => {
    const { text: cleaned, removed } = stripLegalAdvice(clean(text));
    advice += removed;
    return containsDefinitiveConclusion(cleaned) ? NEUTRALIZED_NOTE : cleaned;
  };

  const resolveStatus = (value: string, status: FieldStatus, ids: string[]): { status: FieldStatus; note: string | null } => {
    if (!value) return { status: "not_provided", note: null };
    if (status === "not_provided") return { status: "inferred", note: UNSUPPORTED_NOTE };
    if (status === "stated" && ids.length === 0) {
      downgraded += 1;
      return { status: "inferred", note: UNSUPPORTED_NOTE };
    }
    return { status, note: null };
  };

  const buildField = (raw: IntakeBriefOutput["client"]): IntakeField => {
    const ids = raw.status === "not_provided" ? [] : collector.collect(raw.citations);
    const value = raw.status === "not_provided" ? "" : clean(raw.value);
    const { status, note } = resolveStatus(value, raw.status, ids);
    return { value: status === "not_provided" ? "" : value, status, reference_ids: status === "not_provided" ? [] : ids, note };
  };

  const fields = Object.fromEntries(FIELD_KEYS.map((key) => [key, buildField(output[key])])) as IntakeContent["fields"];

  const keepDate = (date: StatedDate, ids: string[]) => {
    if (date.calendar === "unknown" || !clean(date.text)) return null;
    if (ids.length > 0 && appearsIn(date.text, citedText(ids))) return normalizeStatedDate(date);
    dropped += 1;
    return null;
  };

  const other_parties = output.other_parties
    .filter((p) => clean(p.name))
    .map((p) => {
      const ids = collector.collect(p.citations);
      const { status } = resolveStatus(clean(p.name), p.status, ids);
      return { id: newId(), name: clean(p.name), role: clean(p.role), status, reference_ids: ids };
    });

  const key_events = output.key_events
    .filter((e) => clean(e.description))
    .map((e) => {
      const ids = collector.collect(e.citations);
      return { id: newId(), description: clean(e.description), date: keepDate(e.date, ids), status: resolveStatus(clean(e.description), e.status, ids).status, reference_ids: ids };
    });

  const dates = output.dates.flatMap((d) => {
    const ids = collector.collect(d.citations);
    const date = keepDate(d.date, ids);
    return date ? [{ id: newId(), label: clean(d.label), date, status: "stated" as const, reference_ids: ids }] : [];
  });

  const amounts = output.amounts.flatMap((a) => {
    const ids = collector.collect(a.citations);
    if (!clean(a.amount_text) || ids.length === 0 || !amountAppears(a.amount_text, citedText(ids))) {
      if (clean(a.amount_text)) dropped += 1;
      return [];
    }
    const currency = clean(a.currency) && appearsIn(a.currency, citedText(ids)) ? clean(a.currency) : null;
    return [{ id: newId(), label: clean(a.label), amount_text: clean(a.amount_text), currency, status: "stated" as const, reference_ids: ids }];
  });

  const uploaded = snapshot
    .filter((s) => s.source_kind === "document" || s.source_kind === "audio_recording")
    .map((s) => ({
      id: newId(),
      description: s.file_name,
      origin: "uploaded" as const,
      provided: s.included,
      document_id: s.document_id,
      reference_ids: [],
    }));
  const mentioned = output.documents_mentioned
    .filter((d) => clean(d.description))
    .map((d) => ({ id: newId(), description: clean(d.description), origin: "mentioned" as const, provided: d.provided, document_id: null, reference_ids: collector.collect(d.citations) }));

  const missing_information = output.missing_information.map((m) => guard(m.text)).filter(Boolean).map((text) => ({ id: newId(), text }));
  for (const key of FIELD_KEYS) {
    if (fields[key].status === "not_provided" && key !== "matter_type") {
      missing_information.push({ id: newId(), text: `لم يُقدَّم: ${{ client: "بيانات العميل", relationship: "العلاقة بين الأطراف", requested_outcome: "النتيجة التي يطلبها العميل" }[key]}.` });
    }
  }
  for (const s of snapshot.filter((s) => !s.included)) {
    missing_information.push({ id: newId(), text: `لم يُستخدم «${s.file_name}» لأنه لم يُعالج${s.processing_error ? `: ${s.processing_error}` : "."}` });
  }

  const contradictions = output.contradictions
    .filter((c) => clean(c.topic) && c.statements.filter((s) => clean(s.text)).length >= 2)
    .map((c) => ({ id: newId(), topic: clean(c.topic), statements: c.statements.filter((s) => clean(s.text)).map((s) => ({ text: clean(s.text), reference_ids: collector.collect(s.citations) })) }));

  // Everything that runs the guards must come before the warnings are computed.
  const summaryIds = collector.collect(output.summary.citations);
  const summaryText = guard(output.summary.text);
  const missing_documents = output.missing_documents.filter((d) => clean(d.document)).map((d) => ({ id: newId(), document: clean(d.document), reason: guard(d.reason) }));
  const clarification_questions = output.clarification_questions
    .map((q) => ({ id: newId(), question: guard(q.question), reason: guard(q.reason) }))
    .filter((q) => q.question);
  const questionnaire = output.questionnaire
    .filter((s) => clean(s.section))
    .map((s) => ({
      id: newId(),
      section: clean(s.section),
      questions: s.questions.map((q) => ({ id: newId(), question: guard(q.question), purpose: guard(q.purpose), answer_type: q.answer_type })).filter((q) => q.question),
    }))
    .filter((s) => s.questions.length > 0);

  const warnings: string[] = [];
  if (collector.rejected > 0) warnings.push(`استُبعد ${collector.rejected} اقتباسًا لم يُعثر عليه في كلام العميل أو مستنداته.`);
  if (downgraded > 0) warnings.push(`${downgraded} حقلًا وُسم كمستنتج لعدم العثور على ما يؤيده في كلام العميل.`);
  if (dropped > 0) warnings.push(`حُذف ${dropped} تاريخًا أو مبلغًا لم يرد في النص المستشهد به.`);
  if (advice > 0) warnings.push(`حُذفت ${advice} عبارة تتضمن نصيحة قانونية؛ لا تُقدَّم نصائح في مرحلة الاستقبال.`);
  if (snapshot.some((s) => s.source_kind === "audio_recording" && !s.included)) {
    warnings.push("تسجيل صوتي واحد على الأقل لم يُفرَّغ، ولم يُستخدم في الملخص.");
  }

  return {
    content: {
      version: 1,
      kind: "matter_intake",
      generated_at: now,
      model,
      sources: snapshot,
      summary: { text: summaryText, reference_ids: summaryIds },
      fields,
      other_parties,
      key_events,
      dates,
      amounts,
      documents_received: [...uploaded, ...mentioned],
      missing_information,
      missing_documents,
      contradictions,
      clarification_questions,
      questionnaire,
      warnings,
      last_edited_at: null,
      finalized: null,
    },
    references: collector.references,
  };
}
