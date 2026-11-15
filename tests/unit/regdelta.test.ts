import { describe, expect, it } from "vitest";
import { alignProvisions, amountTokens, classifyPair, periodTokens, similarity, contentTokens, wordDiff } from "@/lib/tools/regdelta/compare";
import { parseArabicOrdinal, splitProvisions } from "@/lib/tools/regdelta/provisions";
import { planChanges, uncertaintyNote } from "@/lib/tools/regdelta/record";
import type { IndexedSource } from "@/lib/tools/shared/citations";
import { SAMPLE_NEXT as NEXT, SAMPLE_PREVIOUS as PREVIOUS } from "@/lib/tools/regdelta/sample";
import { claimsLegalEffect, stripEffectivenessClaims } from "@/lib/tools/shared/language-guard";

const prev = splitProvisions(PREVIOUS, "A");
const next = splitProvisions(NEXT, "B");
const pairs = alignProvisions(prev.provisions, next.provisions);
const { changes, unchanged } = planChanges(pairs);
const byNext = (label: string) => changes.find((c) => c.pair.b?.label === label);

describe("provision splitting", () => {
  it("parses Arabic ordinal article names", () => {
    expect(parseArabicOrdinal("الخامسة")).toBe(5);
    expect(parseArabicOrdinal("الحادية عشرة")).toBe(11);
    expect(parseArabicOrdinal("الثالثة والعشرون")).toBe(23);
    expect(parseArabicOrdinal("الحادية بعد المائة")).toBe(101);
    expect(parseArabicOrdinal("وتنص")).toBeNull();
  });

  it("splits articles, keeps a preamble, and records pages and definitions", () => {
    expect(prev.numbered).toBe(true);
    expect(prev.provisions.map((p) => [p.label, p.number])).toEqual([
      ["الديباجة", null],
      ["المادة الأولى", "1"],
      ["المادة الثانية", "2"],
      ["المادة الثالثة", "3"],
      ["المادة الرابعة", "4"],
      ["المادة الخامسة", "5"],
    ]);
    expect(prev.provisions[1].isDefinitions).toBe(true);
    expect(prev.provisions[3]).toMatchObject({ location: "صفحة 2", segmentIds: ["p2"] });
  });

  it("recognises digit headings with brackets and sub-numbers, and English articles", () => {
    const source: IndexedSource = { ...PREVIOUS, segments: [{ id: "s1", label: "فقرة 1", text: "المادة (٣/٢)\nنص.\nArticle 7\nText here." }] };
    expect(splitProvisions(source, "A").provisions.map((p) => p.number)).toEqual(["3/2", "7"]);
  });

  it("falls back to sections when there is no article numbering", () => {
    const source: IndexedSource = { ...PREVIOUS, segments: [{ id: "s1", label: "فقرة 1", text: "نص بلا ترقيم." }] };
    expect(splitProvisions(source, "A")).toMatchObject({ numbered: false, provisions: [{ number: null, label: "فقرة 1" }] });
  });
});

describe("comparison classification", () => {
  it("keeps identical provisions out of the change list", () => {
    expect(unchanged).toContainEqual({ previous: "الديباجة", next: "الديباجة" });
  });

  it("detects a changed definition", () => {
    expect(byNext("المادة الأولى")?.detected).toEqual(expect.arrayContaining(["modified", "definition"]));
  });

  it("detects changed deadlines from periods in the text", () => {
    expect(periodTokens("خلال 30 يومًا")).not.toEqual(periodTokens("خلال 15 يومًا"));
    expect(byNext("المادة الثانية")?.detected).toEqual(expect.arrayContaining(["modified", "deadline"]));
    expect(byNext("المادة الثانية")?.detected).not.toContain("amount");
  });

  it("detects changed amounts and thresholds, ignoring years", () => {
    expect(amountTokens("غرامة 50,000 ريال عام 2023")).toEqual(["50000"]);
    expect(byNext("المادة الثالثة")?.detected).toEqual(expect.arrayContaining(["modified", "amount"]));
  });

  it("matches a renumbered provision by its text, and explains the uncertainty", () => {
    const moved = byNext("المادة الخامسة")!;
    expect(moved.pair.a?.label).toBe("المادة الرابعة");
    expect(moved.pair.method).toBe("similarity");
    expect(moved.detected).toEqual(["renumbered"]); // same text, new number
    expect(moved.uncertainty).toContain("رغم اختلاف الرقم");
  });

  it("does not silently treat a rewritten article with the same number as deleted and added", () => {
    const rewritten = byNext("المادة الرابعة")!;
    expect(rewritten.pair.a).toBeNull(); // the old article 4 moved to 5, so new 4 is new content
    expect(rewritten.detected).toContain("added");
    const publication = byNext("المادة السادسة")!;
    expect(publication.pair.a?.label).toBe("المادة الخامسة");
    expect(publication.detected).toEqual(expect.arrayContaining(["renumbered", "modified", "deadline"]));
  });

  it("records a plausible counterpart for unmatched provisions", () => {
    const note = uncertaintyNote({
      a: prev.provisions[4],
      b: null,
      method: null,
      similarity: 0,
      confidence: null,
      possibleCounterpart: { id: "B9", label: "المادة التاسعة", similarity: 0.42 },
    });
    expect(note).toContain("المادة التاسعة");
    expect(note).toContain("42%");
    expect(note).toContain("كحذف");
  });

  it("classifies removals and additions", () => {
    expect(classifyPair({ a: prev.provisions[2], b: null }).types).toEqual(["removed"]);
    expect(classifyPair({ a: null, b: next.provisions[1] }).types).toEqual(["added", "definition"]);
  });

  it("scores similarity sensibly", () => {
    expect(similarity(contentTokens(prev.provisions[4]), contentTokens(next.provisions[5]))).toBe(1);
    expect(similarity(contentTokens(prev.provisions[4]), contentTokens(next.provisions[4]))).toBeLessThan(0.3);
  });

  it("highlights word-level differences inside a modified provision", () => {
    const diff = wordDiff("غرامة لا تزيد على 50,000 ريال", "غرامة لا تزيد على 100,000 ريال")!;
    expect(diff.previous.filter((p) => p.kind === "removed").map((p) => p.text.trim())).toEqual(["50,000"]);
    expect(diff.next.filter((p) => p.kind === "added").map((p) => p.text.trim())).toEqual(["100,000"]);
  });
});

describe("language guard", () => {
  it("removes sentences claiming a version is in force, but keeps caveats", () => {
    expect(claimsLegalEffect("هذه النسخة نافذة حاليًا")).toBe(true);
    expect(claimsLegalEffect("لا يمكن التحقق من أن النسخة نافذة")).toBe(false);
    expect(claimsLegalEffect("تتعلق المادة بمنافذ البيع")).toBe(false);
    const result = stripEffectivenessClaims("رُفعت الغرامة. وهذه اللائحة سارية المفعول. يستحق ذلك المراجعة.");
    expect(result).toEqual({ text: "رُفعت الغرامة. يستحق ذلك المراجعة.", removed: 1 });
  });
});

describe("number words", () => {
  it("reads Arabic cardinal words and duals as numbers", async () => {
    const { arabicNumberWordsToDigits } = await import("@/lib/tools/shared/numbers");
    expect(arabicNumberWordsToDigits("خلال خمسة عشر يوما")).toBe("خلال 15 يوما");
    expect(arabicNumberWordsToDigits("بعد تسعين يوما")).toBe("بعد 90 يوما");
    expect(arabicNumberWordsToDigits("خمسة وعشرين يوما")).toBe("25 يوما");
    expect(arabicNumberWordsToDigits("مائة وعشرين يوما")).toBe("120 يوما");
    expect(arabicNumberWordsToDigits("خلال يومين")).toBe("خلال 2 يوم");
    expect(arabicNumberWordsToDigits("تلتزم المنشأة")).toBe("تلتزم المنشأة");
    expect(periodTokens("خلال ثلاثين يومًا")).toEqual(periodTokens("خلال 30 يومًا"));
  });
});

describe("comparison record (sample built through the pipeline)", async () => {
  const { SAMPLE_REGDELTA: content } = await import("@/lib/tools/regdelta/sample");
  const { regDeltaContentSchema } = await import("@/lib/tools/regdelta/content");
  const view = await import("@/lib/tools/regdelta/view");
  const change = (label: string) => content.changes.find((c) => (c.next ?? c.previous)?.label === label)!;

  it("is valid stored content with verbatim texts from both versions", () => {
    expect(regDeltaContentSchema.safeParse(content).success).toBe(true);
    const fine = change("المادة الثالثة");
    expect(fine.previous?.text).toContain("50,000 ريال");
    expect(fine.next?.text).toContain("100,000 ريال");
    expect(content.unchanged).toHaveLength(1);
  });

  it("removes the model's claim that a version is in force", () => {
    expect(change("المادة الثانية").significance).not.toContain("سارية");
    expect(content.warnings.join(" ")).toContain("تفترض نفاذ");
  });

  it("shows detected types before AI-suggested ones and does not repeat them", () => {
    const badges = view.changeTypeBadges(change("المادة الثانية"));
    expect(badges.filter((b) => b.origin === "detected").map((b) => b.key)).toEqual(["modified", "deadline"]);
    expect(badges.filter((b) => b.origin === "ai").map((b) => b.key)).toEqual(["procedural"]);
  });

  it("filters changes by type, by uncertainty, and hides excluded ones", () => {
    expect(view.filterChanges(content.changes, "amount").map((c) => c.next?.label)).toEqual(["المادة الثالثة"]);
    expect(view.filterChanges(content.changes, "responsibility").map((c) => c.next?.label)).toEqual(["المادة الرابعة"]);
    expect(view.filterChanges(content.changes, "uncertain").length).toBeGreaterThan(0);
    const excluded = content.changes.map((c, i) => (i === 0 ? { ...c, excluded: true } : c));
    expect(view.filterChanges(excluded, "all")).toHaveLength(content.changes.length - 1);
    expect(view.filterChanges(excluded, "all", true)).toHaveLength(content.changes.length);
    expect(view.filterCounts(content.changes).all).toBe(content.changes.length);
  });
});

describe("source navigation", async () => {
  const { SAMPLE_REGDELTA: content, SAMPLE_REGDELTA_REFERENCES: refs, SAMPLE_PREVIOUS: A, SAMPLE_NEXT: B } = await import("@/lib/tools/regdelta/sample");
  const view = await import("@/lib/tools/regdelta/view");
  const change = (label: string) => content.changes.find((c) => (c.next ?? c.previous)?.label === label)!;

  it("links a modified provision to its article and page in each version", () => {
    const sources = view.getChangeSources(change("المادة الثالثة"), refs, content);
    expect(sources.previous).toMatchObject({ documentId: A.documentId, location: "المادة الثالثة · صفحة 2", href: `/api/documents/${A.documentId}/download` });
    expect(sources.next).toMatchObject({ documentId: B.documentId, location: "المادة الثالثة · صفحة 2" });
    expect(sources.previous?.excerpt).toContain("50,000");
    expect(sources.next?.excerpt).toContain("100,000");
  });

  it("keeps different article numbers for a renumbered provision", () => {
    const sources = view.getChangeSources(change("المادة الخامسة"), refs, content);
    expect(sources.previous?.location).toBe("المادة الرابعة · صفحة 2");
    expect(sources.next?.location).toBe("المادة الخامسة · صفحة 2");
  });

  it("has a source on one side only for additions and removals", () => {
    const added = view.getChangeSources(change("المادة الرابعة"), refs, content);
    expect(added.previous).toBeNull();
    expect(added.next?.documentId).toBe(B.documentId);
  });

  it("numbers references uniquely and skips missing ones", () => {
    const numbers = [...view.numberRegDeltaReferences(content).values()];
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(view.getChangeSources(change("المادة الثالثة"), [], content)).toEqual({ previous: null, next: null });
  });

  it("builds and parses deep links to a change and side", () => {
    const id = change("المادة الثانية").id;
    const href = view.changeHref("out-1", id, "previous");
    const params = Object.fromEntries(new URL(href, "https://x.test").searchParams);
    expect(view.parseChangeParams(params, content)).toEqual({ change: id, side: "previous" });
    expect(view.parseChangeParams({ change: "C999", side: "next" }, content)).toEqual({ change: null, side: null });
  });
});

describe("reviewer edits", async () => {
  const { SAMPLE_REGDELTA: content } = await import("@/lib/tools/regdelta/sample");
  const { applyRegDeltaEdits, regDeltaEditsSchema } = await import("@/lib/tools/regdelta/edits");
  const first = content.changes[0];

  it("edits interpretation only and marks what changed", () => {
    const edits = regDeltaEditsSchema.parse({
      changes: [{ id: first.id, summary: "ملخص المراجع", significance: first.significance, ai_types: ["scope"], excluded: true }],
      impacts: [{ area: "جديد", description: "أثر أضافه المراجع", change_ids: [first.id, "C999"] }],
      checklist: content.checklist.slice(1).map((c) => ({ id: c.id, item: c.item, change_ids: c.change_ids })),
    });
    const next = applyRegDeltaEdits(content, edits, "2026-02-01T00:00:00Z", () => "new-id");
    const edited = next.changes[0];
    expect(edited).toMatchObject({ summary: "ملخص المراجع", excluded: true, edited: true });
    expect(edited.previous).toEqual(first.previous); // extracted text untouched
    expect(edited.detected_types).toEqual(first.detected_types);
    expect(next.changes[1]).toBe(content.changes[1]); // untouched changes keep identity
    expect(next.impacts).toEqual([{ id: "new-id", area: "جديد", description: "أثر أضافه المراجع", change_ids: [first.id], edited: true }]);
    expect(next.checklist).toHaveLength(content.checklist.length - 1);
    expect(next.checklist.every((c) => !c.edited)).toBe(true);
    expect(next.last_edited_at).toBe("2026-02-01T00:00:00Z");
  });

  it("rejects edits that try to supply extracted text", () => {
    const parsed = regDeltaEditsSchema.safeParse({ changes: [], impacts: [{ area: "", description: "" , change_ids: [] }], checklist: [] });
    expect(parsed.success).toBe(false);
    const withText = regDeltaEditsSchema.parse({ changes: [{ id: first.id, summary: "", significance: "", ai_types: [], excluded: false, previous: { text: "x" } }], impacts: [], checklist: [] });
    expect(withText.changes[0]).not.toHaveProperty("previous");
  });
});
