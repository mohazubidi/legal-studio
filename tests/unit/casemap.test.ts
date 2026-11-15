import { describe, expect, it } from "vitest";
import { caseMapContentSchema } from "@/lib/tools/casemap/content";
import { hijriToGregorian, normalizeStatedDate } from "@/lib/tools/casemap/dates";
import {
  activeFilterCount,
  EMPTY_FILTERS,
  filterCaseMap,
  findCaseMapItem,
  getSourceLinks,
  itemHref,
  layoutTimeline,
  numberCaseMapReferences,
  parseFilters,
  parseView,
  serializeFilters,
  sortEvents,
} from "@/lib/tools/casemap/explore";
import { buildCaseMapRecord } from "@/lib/tools/casemap/record";
import { SAMPLE_CASEMAP as map, SAMPLE_CASEMAP_REFERENCES as refs } from "@/lib/tools/casemap/sample";
import type { CaseMapEvent } from "@/lib/tools/casemap/content";

const supplier = map.parties.find((p) => p.name === "شركة الأفق للتجارة")!;
const buyer = map.parties.find((p) => p.name === "مؤسسة النخبة")!;
const claim = map.claims[0];
const contractDoc = map.sources.find((s) => s.file_name.startsWith("عقد"))!.document_id;
const notesDoc = map.sources.find((s) => s.file_name.startsWith("ملاحظات"))!.document_id;
const eventByTitle = (title: string) => map.events.find((e) => e.title === title)!;

describe("sample map (built through the real pipeline)", () => {
  it("is valid stored content", () => {
    expect(caseMapContentSchema.safeParse(map).success).toBe(true);
  });

  it("rejects the fabricated citation and marks that event unreferenced", () => {
    const delivery = eventByTitle("تسليم البضاعة");
    expect(delivery).toMatchObject({ provenance: "unreferenced", reference_ids: [] });
    expect(map.warnings.join(" ")).toContain("استُبعد 1");
  });

  it("records the failed audio source as missing information", () => {
    expect(map.missing.some((m) => m.kind === "processing_error" && m.text.includes("تسجيل مكالمة"))).toBe(true);
  });
});

describe("filtering", () => {
  it("passes everything through with no filters", () => {
    const result = filterCaseMap(map, refs, EMPTY_FILTERS);
    expect(result.events).toHaveLength(map.events.length);
    expect(result.evidence).toHaveLength(map.evidence.length);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it("filters by party across events, evidence, claims and parties", () => {
    const result = filterCaseMap(map, refs, { ...EMPTY_FILTERS, party: supplier.id });
    expect(result.parties.map((p) => p.id)).toEqual([supplier.id]);
    expect(result.events.every((e) => e.party_ids.includes(supplier.id))).toBe(true);
    expect(result.evidence.map((e) => e.evidence_type)).toEqual(["statement"]);
    expect(result.claims).toHaveLength(1); // the supplier is a respondent
  });

  it("filters by claim", () => {
    const result = filterCaseMap(map, refs, { ...EMPTY_FILTERS, claim: claim.id });
    expect(result.events.map((e) => e.title)).not.toContain("إبرام عقد التوريد");
    expect(result.evidence).toHaveLength(3);
    expect(result.missing.every((m) => m.claim_ids.includes(claim.id))).toBe(true);
    expect(result.parties.map((p) => p.id).sort()).toEqual([supplier.id, buyer.id].sort());
  });

  it("filters by document through each item's references", () => {
    const result = filterCaseMap(map, refs, { ...EMPTY_FILTERS, document: notesDoc });
    expect(result.evidence.map((e) => e.evidence_type)).toEqual(["statement"]);
    expect(result.events).toHaveLength(0);
    expect(result.contradictions).toHaveLength(1); // one statement cites the notes
    // Unreferenced items never match a document filter.
    expect(result.events.some((e) => e.provenance === "unreferenced")).toBe(false);
  });

  it("filters by evidence type without touching other views", () => {
    const result = filterCaseMap(map, refs, { ...EMPTY_FILTERS, evidenceType: "contract" });
    expect(result.evidence.every((e) => e.evidence_type === "contract")).toBe(true);
    expect(result.evidence).toHaveLength(2);
    expect(result.events).toHaveLength(map.events.length);
  });

  it("filters events by date range and reports hidden undated events", () => {
    const result = filterCaseMap(map, refs, { ...EMPTY_FILTERS, from: "2023-10-01" });
    expect(result.events.map((e) => e.title)).toEqual(["خطاب المطالبة بغرامة التأخير"]);
    expect(result.undatedHidden).toBe(1);
    const range = filterCaseMap(map, refs, { ...EMPTY_FILTERS, from: "2023-09-01", to: "2023-09-30" });
    expect(range.events.map((e) => e.title)).toEqual(["إبرام عقد التوريد"]);
  });

  it("combines filters", () => {
    const result = filterCaseMap(map, refs, { ...EMPTY_FILTERS, party: buyer.id, document: contractDoc, evidenceType: "contract" });
    expect(result.evidence).toHaveLength(2);
    expect(result.events.map((e) => e.title)).toEqual(["إبرام عقد التوريد"]);
  });

  it("round-trips filters through the URL and discards unknown values", () => {
    const filters = { ...EMPTY_FILTERS, party: buyer.id, evidenceType: "contract" as const, from: "2023-01-01" };
    const params = serializeFilters(filters, new URLSearchParams("view=evidence"));
    expect(params.get("view")).toBe("evidence");
    expect(parseFilters(params, map)).toEqual(filters);
    const bad = parseFilters(new URLSearchParams("party=nope&type=weapon&from=yesterday&document=x"), map);
    expect(bad).toEqual(EMPTY_FILTERS);
  });
});

describe("source navigation", () => {
  const numbers = numberCaseMapReferences(map);

  it("resolves an event to its document, location and excerpt", () => {
    const event = eventByTitle("إبرام عقد التوريد");
    const item = findCaseMapItem(map, event.id);
    expect(item).toMatchObject({ kind: "event", view: "chronology", referenced: true });
    const links = getSourceLinks(item!.referenceIds, refs, map, numbers);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      documentId: contractDoc,
      documentName: "عقد توريد (مثال).pdf",
      location: "صفحة 1",
      excerpt: "أبرم هذا العقد في 1445/03/12هـ",
      href: `/api/documents/${contractDoc}/download`,
    });
    expect(links[0].number).toBeGreaterThan(0);
  });

  it("resolves evidence with its interpretation kept separate", () => {
    const evidence = map.evidence.find((e) => e.evidence_type === "statement")!;
    const item = findCaseMapItem(map, evidence.id);
    expect(item).toMatchObject({ kind: "evidence", view: "evidence", interpretation: evidence.supports });
    expect(getSourceLinks(item!.referenceIds, refs, map)[0].documentId).toBe(notesDoc);
  });

  it("returns no links, and says so, for an unreferenced item", () => {
    const item = findCaseMapItem(map, eventByTitle("تسليم البضاعة").id);
    expect(item?.referenced).toBe(false);
    expect(getSourceLinks(item!.referenceIds, refs, map)).toEqual([]);
  });

  it("finds claim positions and contradiction statements", () => {
    expect(findCaseMapItem(map, `${claim.id}:1`)).toMatchObject({ kind: "position", view: "claims", referenced: true });
    const statement = map.contradictions[0].statements[1];
    expect(findCaseMapItem(map, statement.id)).toMatchObject({ kind: "statement", view: "contradictions" });
    expect(findCaseMapItem(map, "does-not-exist")).toBeNull();
  });

  it("ignores references that no longer exist", () => {
    const event = eventByTitle("إبرام عقد التوريد");
    expect(getSourceLinks(event.reference_ids, [], map)).toEqual([]);
  });

  it("numbers references uniquely in reading order", () => {
    const values = [...numbers.values()];
    expect(new Set(values).size).toBe(values.length);
    expect(Math.min(...values)).toBe(1);
  });

  it("builds deep links that reopen the item in its view with the current filters", () => {
    const evidence = map.evidence[0];
    const href = itemHref("out-1", { id: evidence.id, view: "evidence" }, { ...EMPTY_FILTERS, party: buyer.id });
    const url = new URL(href, "https://x.test");
    expect(url.pathname).toBe("/tools/casemap/out-1");
    expect(url.searchParams.get("item")).toBe(evidence.id);
    expect(url.searchParams.get("view")).toBe("evidence");
    expect(url.searchParams.get("party")).toBe(buyer.id);
    expect(parseView("evidence")).toBe("evidence");
    expect(parseView("bogus")).toBe("parties");
  });
});

describe("dates", () => {
  it("converts Umm al-Qura Hijri dates to Gregorian", () => {
    expect(hijriToGregorian(1445, 3, 13)).toBe("2023-09-28");
    expect(hijriToGregorian(1445, 3, 12)).toBe("2023-09-27");
    expect(hijriToGregorian(1445, 13, 1)).toBeNull();
  });

  it("keeps the stated text and flags conversion", () => {
    expect(normalizeStatedDate({ text: "1445/03/12هـ", calendar: "hijri", year: 1445, month: 3, day: 12 })).toEqual({
      text: "1445/03/12هـ",
      calendar: "hijri",
      iso: "2023-09-27",
      precision: "day",
      converted: true,
    });
  });

  it("never invents missing parts or impossible dates", () => {
    expect(normalizeStatedDate({ text: "مارس 2024", calendar: "gregorian", year: 2024, month: 3, day: 0 })).toMatchObject({ iso: "2024-03-01", precision: "month" });
    expect(normalizeStatedDate({ text: "2023-02-30", calendar: "gregorian", year: 2023, month: 2, day: 30 }).iso).toBeNull();
    expect(normalizeStatedDate({ text: "", calendar: "unknown", year: 0, month: 0, day: 0 }).iso).toBeNull();
  });
});

describe("timeline layout", () => {
  const event = (id: string, iso: string | null): CaseMapEvent => ({
    id,
    title: id,
    description: "",
    date: { text: iso ?? "", calendar: iso ? "gregorian" : "unknown", iso, precision: iso ? "day" : null, converted: false },
    party_ids: [],
    claim_ids: [],
    provenance: "source",
    reference_ids: [],
  });

  it("places events proportionally and lists undated ones separately", () => {
    const layout = layoutTimeline([event("c", "2024-01-31"), event("a", "2024-01-01"), event("u", null), event("b", "2024-01-16")]);
    expect(layout.points.map((p) => [p.event.id, Number(p.position.toFixed(2))])).toEqual([
      ["a", 0],
      ["b", 0.5],
      ["c", 1],
    ]);
    expect(layout.undated.map((e) => e.id)).toEqual(["u"]);
    expect([layout.start, layout.end]).toEqual(["2024-01-01", "2024-01-31"]);
  });

  it("staggers points that would overlap into different lanes", () => {
    const layout = layoutTimeline([event("a", "2024-01-01"), event("b", "2024-01-02"), event("c", "2024-12-31")]);
    expect(layout.points[0].lane).not.toBe(layout.points[1].lane);
    expect(layout.points[2].lane).toBe(0);
  });

  it("sorts undated events last", () => {
    expect(sortEvents([event("u", null), event("a", "2020-01-01")]).map((e) => e.id)).toEqual(["a", "u"]);
  });
});

describe("buildCaseMapRecord", () => {
  it("drops unknown keys, short contradictions and keeps unreferenced items flagged", () => {
    let n = 0;
    const record = buildCaseMapRecord({
      output: {
        parties: [{ key: "P1", name: "أ", role: "", citations: [] }],
        claims: [{ key: "C1", title: "مطالبة", claimant_keys: ["P1", "P9"], respondent_keys: [], citations: [], positions: [{ party_key: "P7", position: "x", citations: [] }] }],
        events: [],
        evidence: [{ evidence_type: "other", description: "دليل", supports: "", claim_keys: ["C9"], party_keys: [], citations: [] }],
        contradictions: [{ kind: "fact", topic: "واحد فقط", statements: [{ text: "إفادة", citations: [] }], interpretation: "" }],
        missing_information: [],
      },
      sources: [],
      snapshot: [],
      model: "m",
      now: "2026-01-01T00:00:00Z",
      newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    });
    const { content } = record;
    expect(content.parties[0].provenance).toBe("unreferenced");
    expect(content.claims[0].claimant_ids).toHaveLength(1);
    expect(content.claims[0].positions).toHaveLength(0);
    expect(content.evidence[0]).toMatchObject({ claim_ids: [], provenance: "unreferenced" });
    expect(content.contradictions).toHaveLength(0);
    expect(content.warnings.join(" ")).toContain("أُهمل");
    expect(record.references).toHaveLength(0);
  });
});
