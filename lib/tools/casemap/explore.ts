import type { SourceReferenceRow } from "@/types/database";
import { EVIDENCE_TYPES, type EvidenceType } from "./model-schema";
import type {
  CaseMapClaim,
  CaseMapContent,
  CaseMapContradiction,
  CaseMapEvent,
  CaseMapEvidence,
  CaseMapMissing,
  CaseMapParty,
} from "./content";

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface CaseMapFilters {
  party: string | null;
  claim: string | null;
  document: string | null;
  evidenceType: EvidenceType | null;
  /** Inclusive ISO dates (yyyy-mm-dd). Apply to dated events only. */
  from: string | null;
  to: string | null;
}

export const EMPTY_FILTERS: CaseMapFilters = { party: null, claim: null, document: null, evidenceType: null, from: null, to: null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function read(params: ParamSource, key: string): string | null {
  const value = params instanceof URLSearchParams ? params.get(key) : params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single ? single : null;
}

/** Reads filters from the URL, discarding values that do not exist in this map. */
export function parseFilters(params: ParamSource, content: CaseMapContent): CaseMapFilters {
  const party = read(params, "party");
  const claim = read(params, "claim");
  const document = read(params, "document");
  const evidenceType = read(params, "type");
  const from = read(params, "from");
  const to = read(params, "to");
  return {
    party: party && content.parties.some((p) => p.id === party) ? party : null,
    claim: claim && content.claims.some((c) => c.id === claim) ? claim : null,
    document: document && content.sources.some((s) => s.document_id === document) ? document : null,
    evidenceType: evidenceType && (EVIDENCE_TYPES as readonly string[]).includes(evidenceType) ? (evidenceType as EvidenceType) : null,
    from: from && ISO_DATE.test(from) ? from : null,
    to: to && ISO_DATE.test(to) ? to : null,
  };
}

/** Writes filters to URL params (only the ones that are set), keeping other params. */
export function serializeFilters(filters: CaseMapFilters, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  const entries: [string, string | null][] = [
    ["party", filters.party],
    ["claim", filters.claim],
    ["document", filters.document],
    ["type", filters.evidenceType],
    ["from", filters.from],
    ["to", filters.to],
  ];
  for (const [key, value] of entries) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  return params;
}

export function activeFilterCount(filters: CaseMapFilters): number {
  return Object.values(filters).filter(Boolean).length;
}

export interface FilteredCaseMap {
  parties: CaseMapParty[];
  claims: CaseMapClaim[];
  events: CaseMapEvent[];
  evidence: CaseMapEvidence[];
  contradictions: CaseMapContradiction[];
  missing: CaseMapMissing[];
  /** Events hidden only because they have no date while a date filter is set. */
  undatedHidden: number;
}

/**
 * Applies filters. Each filter applies only to item types that carry that
 * dimension (e.g. evidence type affects evidence only); the rest pass through.
 * The document filter applies to every item through its source references.
 */
export function filterCaseMap(content: CaseMapContent, references: SourceReferenceRow[], filters: CaseMapFilters): FilteredCaseMap {
  const documentOf = new Map(references.map((ref) => [ref.id, ref.document_id]));
  const inDocument = (ids: string[]) => !filters.document || ids.some((id) => documentOf.get(id) === filters.document);

  const claimParties = (claim: CaseMapClaim) => [...claim.claimant_ids, ...claim.respondent_ids, ...claim.positions.map((p) => p.party_id)];
  const selectedClaim = filters.claim ? content.claims.find((c) => c.id === filters.claim) : undefined;

  const parties = content.parties.filter(
    (party) =>
      (!filters.party || party.id === filters.party) &&
      (!selectedClaim || claimParties(selectedClaim).includes(party.id)) &&
      inDocument(party.reference_ids),
  );

  const claims = content.claims.filter(
    (claim) =>
      (!filters.party || claimParties(claim).includes(filters.party)) &&
      (!filters.claim || claim.id === filters.claim) &&
      inDocument([...claim.reference_ids, ...claim.positions.flatMap((p) => p.reference_ids)]),
  );

  const dateFiltered = Boolean(filters.from || filters.to);
  let undatedHidden = 0;
  const events = content.events.filter((event) => {
    if (filters.party && !event.party_ids.includes(filters.party)) return false;
    if (filters.claim && !event.claim_ids.includes(filters.claim)) return false;
    if (!inDocument(event.reference_ids)) return false;
    if (dateFiltered) {
      if (!event.date.iso) {
        undatedHidden += 1;
        return false;
      }
      if (filters.from && event.date.iso < filters.from) return false;
      if (filters.to && event.date.iso > filters.to) return false;
    }
    return true;
  });

  const evidence = content.evidence.filter(
    (item) =>
      (!filters.party || item.party_ids.includes(filters.party)) &&
      (!filters.claim || item.claim_ids.includes(filters.claim)) &&
      (!filters.evidenceType || item.evidence_type === filters.evidenceType) &&
      inDocument(item.reference_ids),
  );

  const contradictions = content.contradictions.filter((item) => inDocument(item.statements.flatMap((s) => s.reference_ids)));

  const missing = content.missing.filter(
    (item) => (!filters.claim || item.claim_ids.includes(filters.claim)) && (!filters.document || inDocument(item.reference_ids)),
  );

  return { parties, claims, events: sortEvents(events), evidence, contradictions, missing, undatedHidden };
}

/** Chronological order; undated events last, in extraction order. */
export function sortEvents(events: CaseMapEvent[]): CaseMapEvent[] {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const x = a.event.date.iso;
      const y = b.event.date.iso;
      if (x && y && x !== y) return x < y ? -1 : 1;
      if (x && !y) return -1;
      if (!x && y) return 1;
      return a.index - b.index;
    })
    .map(({ event }) => event);
}

// ---------------------------------------------------------------------------
// Source navigation
// ---------------------------------------------------------------------------

export interface SourceLink {
  number: number;
  referenceId: string;
  documentId: string;
  documentName: string;
  location: string | null;
  excerpt: string;
  /** Opens the original file (authorised, short-lived signed URL). */
  href: string;
}

/** [م n] numbering in reading order across the whole map. */
export function numberCaseMapReferences(content: CaseMapContent): Map<string, number> {
  const numbers = new Map<string, number>();
  const add = (ids: string[]) => ids.forEach((id) => numbers.has(id) || numbers.set(id, numbers.size + 1));
  content.parties.forEach((p) => add(p.reference_ids));
  content.claims.forEach((c) => {
    add(c.reference_ids);
    c.positions.forEach((p) => add(p.reference_ids));
  });
  sortEvents(content.events).forEach((e) => add(e.reference_ids));
  content.evidence.forEach((e) => add(e.reference_ids));
  content.contradictions.forEach((c) => c.statements.forEach((s) => add(s.reference_ids)));
  content.missing.forEach((m) => add(m.reference_ids));
  return numbers;
}

/** Resolves an item's reference ids to the document, location and excerpt behind them. */
export function getSourceLinks(
  referenceIds: string[],
  references: SourceReferenceRow[],
  content: CaseMapContent,
  numbers: Map<string, number> = numberCaseMapReferences(content),
): SourceLink[] {
  const byId = new Map(references.map((ref) => [ref.id, ref]));
  const names = new Map(content.sources.map((s) => [s.document_id, s.file_name]));
  return referenceIds.flatMap((id) => {
    const ref = byId.get(id);
    if (!ref) return [];
    return [
      {
        number: numbers.get(id) ?? 0,
        referenceId: id,
        documentId: ref.document_id,
        documentName: names.get(ref.document_id) ?? "مستند محذوف",
        location: ref.page_or_section,
        excerpt: ref.source_text,
        href: `/api/documents/${ref.document_id}/download`,
      },
    ];
  });
}

export type CaseMapItemKind = "party" | "claim" | "position" | "event" | "evidence" | "statement" | "missing";

export interface CaseMapItemRef {
  kind: CaseMapItemKind;
  id: string;
  title: string;
  /** Extracted text. */
  detail: string;
  /** AI interpretation, kept separate from the extracted text. */
  interpretation: string | null;
  referenceIds: string[];
  /** False when nothing could be verified against a source. */
  referenced: boolean;
  /** The view the item lives in, for deep links. */
  view: CaseMapView;
}

export const CASEMAP_VIEWS = ["parties", "chronology", "claims", "evidence", "contradictions", "missing"] as const;
export type CaseMapView = (typeof CASEMAP_VIEWS)[number];

export function parseView(value: string | null | undefined): CaseMapView {
  return (CASEMAP_VIEWS as readonly string[]).includes(value ?? "") ? (value as CaseMapView) : "parties";
}

/** Finds any item by id, so a click or a deep link (?item=) can show its sources. */
export function findCaseMapItem(content: CaseMapContent, itemId: string): CaseMapItemRef | null {
  const party = content.parties.find((p) => p.id === itemId);
  if (party) {
    return { kind: "party", id: party.id, title: party.name, detail: party.role, interpretation: null, referenceIds: party.reference_ids, referenced: party.provenance === "source", view: "parties" };
  }
  for (const claim of content.claims) {
    if (claim.id === itemId) {
      return { kind: "claim", id: claim.id, title: claim.title, detail: "", interpretation: null, referenceIds: claim.reference_ids, referenced: claim.provenance === "source", view: "claims" };
    }
    const index = claim.positions.findIndex((_, i) => `${claim.id}:${i}` === itemId);
    if (index >= 0) {
      const position = claim.positions[index];
      const partyName = content.parties.find((p) => p.id === position.party_id)?.name ?? "طرف";
      return {
        kind: "position",
        id: itemId,
        title: `موقف ${partyName} — ${claim.title}`,
        detail: position.position,
        interpretation: null,
        referenceIds: position.reference_ids,
        referenced: position.provenance === "source",
        view: "claims",
      };
    }
  }
  const event = content.events.find((e) => e.id === itemId);
  if (event) {
    return { kind: "event", id: event.id, title: event.title, detail: event.description, interpretation: null, referenceIds: event.reference_ids, referenced: event.provenance === "source", view: "chronology" };
  }
  const evidence = content.evidence.find((e) => e.id === itemId);
  if (evidence) {
    return {
      kind: "evidence",
      id: evidence.id,
      title: evidence.description,
      detail: "",
      interpretation: evidence.supports || null,
      referenceIds: evidence.reference_ids,
      referenced: evidence.provenance === "source",
      view: "evidence",
    };
  }
  for (const contradiction of content.contradictions) {
    const statement = contradiction.statements.find((s) => s.id === itemId);
    if (statement) {
      return {
        kind: "statement",
        id: statement.id,
        title: contradiction.topic,
        detail: statement.text,
        interpretation: contradiction.interpretation || null,
        referenceIds: statement.reference_ids,
        referenced: statement.provenance === "source",
        view: "contradictions",
      };
    }
  }
  const missing = content.missing.find((m) => m.id === itemId);
  if (missing) {
    return { kind: "missing", id: missing.id, title: missing.text, detail: "", interpretation: null, referenceIds: missing.reference_ids, referenced: missing.reference_ids.length > 0, view: "missing" };
  }
  return null;
}

/** URL that reopens the map on the item's view with its source panel open. */
export function itemHref(outputId: string, item: Pick<CaseMapItemRef, "id" | "view">, filters?: CaseMapFilters): string {
  const params = serializeFilters(filters ?? EMPTY_FILTERS);
  params.set("view", item.view);
  params.set("item", item.id);
  return `/tools/casemap/${outputId}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Timeline layout
// ---------------------------------------------------------------------------

export interface TimelinePoint {
  event: CaseMapEvent;
  /** 0–1 along the axis. */
  position: number;
  /** Vertical lane, so points that would overlap are staggered. */
  lane: number;
}

export interface TimelineLayout {
  points: TimelinePoint[];
  undated: CaseMapEvent[];
  start: string | null;
  end: string | null;
}

const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/** Places dated events proportionally along an axis; overlapping points move to another lane. */
export function layoutTimeline(events: CaseMapEvent[], lanes = 3, minGap = 0.04): TimelineLayout {
  const sorted = sortEvents(events);
  const dated = sorted.filter((e): e is CaseMapEvent & { date: { iso: string } } => Boolean(e.date.iso));
  const undated = sorted.filter((e) => !e.date.iso);
  if (dated.length === 0) return { points: [], undated, start: null, end: null };

  const first = dayNumber(dated[0].date.iso);
  const last = dayNumber(dated[dated.length - 1].date.iso);
  const span = Math.max(last - first, 1);
  const lastInLane: number[] = Array.from({ length: lanes }, () => -Infinity);

  const points = dated.map((event) => {
    const position = dated.length === 1 ? 0.5 : (dayNumber(event.date.iso) - first) / span;
    let lane = lastInLane.findIndex((previous) => position - previous >= minGap);
    if (lane === -1) lane = lastInLane.indexOf(Math.min(...lastInLane));
    lastInLane[lane] = position;
    return { event, position, lane };
  });
  return { points, undated, start: dated[0].date.iso, end: dated[dated.length - 1].date.iso };
}
