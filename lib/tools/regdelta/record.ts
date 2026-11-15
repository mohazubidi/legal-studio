import type { VerifiedReference } from "@/lib/tools/shared/citations";
import { containsDefinitiveConclusion, NEUTRALIZED_NOTE, stripEffectivenessClaims } from "@/lib/tools/shared/language-guard";
import type { SourceSnapshot } from "@/lib/tools/shared/sources";
import { classifyPair, type ProvisionPair } from "./compare";
import type { RegDeltaContent, RegDeltaChange } from "./content";
import type { RegDeltaOutput } from "./model-schema";
import type { Provision } from "./provisions";

/** A change computed by the server, before the model explains it. */
export interface PlannedChange {
  id: string;
  pair: ProvisionPair;
  detected: RegDeltaChange["detected_types"];
  uncertainty: string | null;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** The server's own note on how (un)certain a match is. Never left to the model. */
export function uncertaintyNote(pair: ProvisionPair): string | null {
  const { a, b } = pair;
  if (a && b) {
    if (pair.method === "similarity" && a.number !== b.number && a.number && b.number) {
      return `طوبقت «${a.label}» في النسخة السابقة مع «${b.label}» في النسخة الجديدة بالتشابه النصي (${pct(pair.similarity)}) رغم اختلاف الرقم. يتطلب تحققًا من أن الحكم نفسه نُقل.`;
    }
    if (pair.method === "number" && pair.confidence === "low") {
      return `للحكمين الرقم نفسه لكن التشابه النصي منخفض (${pct(pair.similarity)})؛ قد يكون الحكم أعيدت صياغته بالكامل أو استُبدل بحكم آخر. يتطلب تحققًا.`;
    }
    if (pair.method === "similarity" && (!a.number || !b.number)) {
      return `طوبق الحكمان بالتشابه النصي (${pct(pair.similarity)}) لعدم وجود ترقيم مواد يمكن الاعتماد عليه.`;
    }
    return null;
  }
  if (pair.possibleCounterpart) {
    const other = a ? "الجديدة" : "السابقة";
    return `قد يقابل هذا الحكمُ «${pair.possibleCounterpart.label}» في النسخة ${other} (تشابه ${pct(pair.possibleCounterpart.similarity)})، لكن التشابه دون حد المطابقة، فعومل ${a ? "كحذف" : "كإضافة"}. يتطلب تحققًا من أنه لم يُنقل أو يُعد ترقيمه.`;
  }
  return null;
}

/** Plans the comparison: classifies every pair and keeps only changes (unchanged pairs are listed separately). */
export function planChanges(pairs: ProvisionPair[]): { changes: PlannedChange[]; unchanged: { previous: string; next: string }[] } {
  const changes: PlannedChange[] = [];
  const unchanged: { previous: string; next: string }[] = [];
  for (const pair of pairs) {
    const { types, unchanged: same } = classifyPair(pair);
    if (same) {
      unchanged.push({ previous: pair.a?.label ?? "", next: pair.b?.label ?? "" });
      continue;
    }
    changes.push({ id: `C${changes.length + 1}`, pair, detected: types, uncertainty: uncertaintyNote(pair) });
  }
  return { changes, unchanged };
}

const SOURCE_EXCERPT_CHARS = 2000;

/** Guards AI text: removes claims that a version is in force and replaces definitive conclusions. */
export function guardText(text: string, counters: { effect: number; definitive: number }): string {
  const { text: cleaned, removed } = stripEffectivenessClaims(text.trim());
  counters.effect += removed;
  if (containsDefinitiveConclusion(cleaned)) {
    counters.definitive += 1;
    return NEUTRALIZED_NOTE;
  }
  return cleaned;
}

export interface BuildRegDeltaInput {
  planned: PlannedChange[];
  unchanged: { previous: string; next: string }[];
  previous: { documentId: string; fileName: string; numbered: boolean; provisions: Provision[] };
  next: { documentId: string; fileName: string; numbered: boolean; provisions: Provision[] };
  snapshot: SourceSnapshot[];
  ai: RegDeltaOutput;
  model: string;
  now: string;
  newId: () => string;
}

/**
 * Assembles stored content: server-computed texts, locations, types and
 * uncertainty notes, plus the model's guarded explanations. Every provision
 * shown gets a source reference (document, first segment, article + page).
 */
export function buildRegDeltaRecord(input: BuildRegDeltaInput): { content: RegDeltaContent; references: VerifiedReference[] } {
  const references: VerifiedReference[] = [];
  const counters = { effect: 0, definitive: 0 };
  const changeIds = new Set(input.planned.map((c) => c.id));
  const aiById = new Map(input.ai.changes.filter((c) => changeIds.has(c.change_id.trim())).map((c) => [c.change_id.trim(), c]));

  const side = (provision: Provision | null, documentId: string) => {
    if (!provision) return null;
    const id = input.newId();
    references.push({
      id,
      document_id: documentId,
      segment_id: provision.segmentIds[0],
      page_or_section: `${provision.label} · ${provision.location}`.slice(0, 100),
      source_text: provision.text.slice(0, SOURCE_EXCERPT_CHARS),
    });
    return { provision_id: provision.id, label: provision.label, number: provision.number, location: provision.location, text: provision.text, reference_id: id };
  };

  const changes: RegDeltaContent["changes"] = input.planned.map((planned) => {
    const ai = aiById.get(planned.id);
    return {
      id: planned.id,
      detected_types: planned.detected,
      ai_types: [...new Set(ai?.ai_types ?? [])],
      previous: side(planned.pair.a, input.previous.documentId),
      next: side(planned.pair.b, input.next.documentId),
      match: planned.pair.method ? { method: planned.pair.method, similarity: planned.pair.similarity, confidence: planned.pair.confidence ?? "low" } : null,
      uncertainty: planned.uncertainty,
      summary: ai ? guardText(ai.summary, counters) : "",
      significance: ai ? guardText(ai.significance, counters) : "لم يُقدَّم تفسير آلي لهذا التغيير.",
      match_assessment: ai ? guardText(ai.match_assessment, counters) : "",
      excluded: false,
      edited: false,
    };
  });

  const linked = (ids: string[]) => [...new Set(ids.map((id) => id.trim()).filter((id) => changeIds.has(id)))];
  const impacts = input.ai.operational_impacts
    .map((item) => ({ id: input.newId(), area: guardText(item.area, counters), description: guardText(item.description, counters), change_ids: linked(item.change_ids), edited: false }))
    .filter((item) => item.description);
  const checklist = input.ai.checklist
    .map((item) => ({ id: input.newId(), item: guardText(item.item, counters), change_ids: linked(item.change_ids), edited: false }))
    .filter((item) => item.item);

  const warnings: string[] = [];
  if (!input.previous.numbered || !input.next.numbered) {
    warnings.push("لم يُرصد ترقيم مواد في إحدى النسختين؛ اعتمدت المطابقة على التشابه النصي بين الأقسام، وهي أقل دقة.");
  }
  const uncertain = changes.filter((c) => c.uncertainty).length;
  if (uncertain > 0) warnings.push(`${uncertain} تغييرًا يتضمن مطابقة غير مؤكدة بين النسختين. راجع ملاحظة المطابقة في كل منها.`);
  if (counters.effect > 0) warnings.push(`حُذفت ${counters.effect} عبارة تفترض نفاذ إحدى النسختين، لأن النفاذ لم يُتحقق منه.`);
  if (counters.definitive > 0) warnings.push(`استُبدل ${counters.definitive} وصفًا قاطعًا بصياغة مهنية.`);
  const unexplained = changes.filter((c) => !aiById.has(c.id)).length;
  if (unexplained > 0) warnings.push(`${unexplained} تغييرًا بلا تفسير آلي؛ النصان معروضان كما وردا.`);

  return {
    content: {
      version: 1,
      kind: "regdelta",
      generated_at: input.now,
      model: input.model,
      documents: {
        previous: { document_id: input.previous.documentId, file_name: input.previous.fileName, numbered: input.previous.numbered, provision_count: input.previous.provisions.length },
        next: { document_id: input.next.documentId, file_name: input.next.fileName, numbered: input.next.numbered, provision_count: input.next.provisions.length },
      },
      sources: input.snapshot,
      unchanged: input.unchanged,
      changes,
      impacts,
      checklist,
      warnings,
      last_edited_at: null,
    },
    references,
  };
}
