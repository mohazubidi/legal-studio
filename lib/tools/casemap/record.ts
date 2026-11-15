import { ReferenceCollector, type IndexedSource, type VerifiedReference } from "@/lib/tools/shared/citations";
import type { SourceSnapshot } from "@/lib/tools/shared/sources";
import type { CaseMapContent } from "./content";
import { normalizeStatedDate } from "./dates";
import type { CaseMapOutput } from "./model-schema";

export interface BuildCaseMapInput {
  output: CaseMapOutput;
  sources: IndexedSource[];
  snapshot: SourceSnapshot[];
  model: string;
  now: string;
  newId: () => string;
}

const clean = (text: string) => text.trim();

/**
 * Turns validated model output into stored content plus source_references.
 *  - every citation is verified against the cited segment; unverifiable ones are dropped;
 *  - an item with no verified citation is stored as `unreferenced` (requires review);
 *  - cross-references by key are resolved to ids; unknown keys are dropped;
 *  - a contradiction needs at least two statements to be kept;
 *  - failed or unprocessed sources become missing-information items.
 */
export function buildCaseMapRecord({ output, sources, snapshot, model, now, newId }: BuildCaseMapInput): {
  content: CaseMapContent;
  references: VerifiedReference[];
} {
  const collector = new ReferenceCollector(new Map(sources.map((s) => [s.sourceId, s])), newId);
  let droppedKeys = 0;

  const partyIds = new Map<string, string>();
  const parties: CaseMapContent["parties"] = [];
  for (const party of output.parties) {
    const name = clean(party.name);
    const key = clean(party.key);
    if (!name || !key || partyIds.has(key)) continue;
    const id = newId();
    partyIds.set(key, id);
    const referenceIds = collector.collect(party.citations);
    parties.push({ id, name, role: clean(party.role), provenance: referenceIds.length ? "source" : "unreferenced", reference_ids: referenceIds });
  }

  const resolve = (keys: string[], map: Map<string, string>) =>
    [
      ...new Set(
        keys.flatMap((key) => {
          const id = map.get(clean(key));
          if (!id) droppedKeys += 1;
          return id ? [id] : [];
        }),
      ),
    ];

  // Claims are keyed first so events and evidence can point at them.
  const claimIds = new Map<string, string>();
  for (const claim of output.claims) {
    const key = clean(claim.key);
    if (key && clean(claim.title) && !claimIds.has(key)) claimIds.set(key, newId());
  }
  const seenClaims = new Set<string>();
  const claims: CaseMapContent["claims"] = output.claims.flatMap((claim) => {
    const id = claimIds.get(clean(claim.key));
    // Only the first claim with a given key is kept.
    if (!id || !clean(claim.title) || seenClaims.has(id)) return [];
    seenClaims.add(id);
    const referenceIds = collector.collect(claim.citations);
    return [
      {
        id,
        title: clean(claim.title),
        claimant_ids: resolve(claim.claimant_keys, partyIds),
        respondent_ids: resolve(claim.respondent_keys, partyIds),
        provenance: referenceIds.length ? ("source" as const) : ("unreferenced" as const),
        reference_ids: referenceIds,
        positions: claim.positions.flatMap((position) => {
          const partyId = partyIds.get(clean(position.party_key));
          if (!partyId || !clean(position.position)) {
            droppedKeys += partyId ? 0 : 1;
            return [];
          }
          const refs = collector.collect(position.citations);
          return [{ party_id: partyId, position: clean(position.position), provenance: refs.length ? ("source" as const) : ("unreferenced" as const), reference_ids: refs }];
        }),
      },
    ];
  });

  const events: CaseMapContent["events"] = output.events
    .filter((event) => clean(event.title))
    .map((event) => {
      const referenceIds = collector.collect(event.citations);
      return {
        id: newId(),
        title: clean(event.title),
        description: clean(event.description),
        date: normalizeStatedDate(event.date),
        party_ids: resolve(event.party_keys, partyIds),
        claim_ids: resolve(event.claim_keys, claimIds),
        provenance: referenceIds.length ? "source" : "unreferenced",
        reference_ids: referenceIds,
      };
    });

  const evidence: CaseMapContent["evidence"] = output.evidence
    .filter((item) => clean(item.description))
    .map((item) => {
      const referenceIds = collector.collect(item.citations);
      return {
        id: newId(),
        evidence_type: item.evidence_type,
        description: clean(item.description),
        supports: clean(item.supports),
        claim_ids: resolve(item.claim_keys, claimIds),
        party_ids: resolve(item.party_keys, partyIds),
        provenance: referenceIds.length ? "source" : "unreferenced",
        reference_ids: referenceIds,
      };
    });

  const contradictions: CaseMapContent["contradictions"] = output.contradictions
    .filter((item) => clean(item.topic) && item.statements.filter((s) => clean(s.text)).length >= 2)
    .map((item) => ({
      id: newId(),
      kind: item.kind,
      topic: clean(item.topic),
      interpretation: clean(item.interpretation),
      statements: item.statements
        .filter((s) => clean(s.text))
        .map((statement) => {
          const refs = collector.collect(statement.citations);
          return { id: newId(), text: clean(statement.text), provenance: refs.length ? ("source" as const) : ("unreferenced" as const), reference_ids: refs };
        }),
    }));

  const missing: CaseMapContent["missing"] = output.missing_information
    .filter((item) => clean(item.text))
    .map((item) => ({
      id: newId(),
      kind: item.kind,
      text: clean(item.text),
      claim_ids: resolve(item.claim_keys, claimIds),
      reference_ids: collector.collect(item.citations),
    }));
  for (const source of snapshot) {
    if (source.included) continue;
    missing.push({
      id: newId(),
      kind: "processing_error",
      text:
        source.processing_status === "failed"
          ? `تعذّرت معالجة «${source.file_name}»${source.processing_error ? `: ${source.processing_error}` : "."} لم يُستخدم في الخريطة.`
          : `لم تكتمل معالجة «${source.file_name}»، ولم يُستخدم في الخريطة.`,
      claim_ids: [],
      reference_ids: [],
    });
  }

  const warnings: string[] = [];
  const unreferenced =
    parties.filter((p) => p.provenance === "unreferenced").length +
    claims.filter((c) => c.provenance === "unreferenced").length +
    events.filter((e) => e.provenance === "unreferenced").length +
    evidence.filter((e) => e.provenance === "unreferenced").length;
  if (collector.rejected > 0) warnings.push(`استُبعد ${collector.rejected} استشهادًا لم يُعثر على نصه في المصدر المذكور.`);
  if (unreferenced > 0) warnings.push(`${unreferenced} عنصرًا بلا مصدر مُتحقَّق منه، ووُسم بأنه يتطلب مراجعة.`);
  if (droppedKeys > 0) warnings.push(`أُهمل ${droppedKeys} ربطًا بطرف أو مطالبة غير معرّفين.`);
  if (snapshot.some((s) => !s.included)) warnings.push("لم تُستخدم جميع المصادر. راجع تبويب المعلومات الناقصة.");

  return {
    content: {
      version: 1,
      kind: "casemap",
      generated_at: now,
      model,
      sources: snapshot,
      parties,
      claims: claims,
      events,
      evidence,
      contradictions,
      missing,
      warnings,
    },
    references: collector.references,
  };
}
