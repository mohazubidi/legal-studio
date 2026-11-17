import { describe, expect, it, vi } from "vitest";
import { articleSegments, libraryLawSchema, librarySourceName, librarySourceText, normalizeSearch, searchPattern } from "@/lib/library/format";
import { importLaws, itemsFromJson, type Upsert } from "@/lib/library/importer";

const law = (overrides: Record<string, unknown> = {}) => ({
  external_id: "labor-law",
  title: "نظام العمل",
  source_url: "https://laws.boe.gov.sa/example",
  fetched_at: "2026-11-01T10:00:00Z",
  articles: [
    { label: "المادة الأولى", text: "  يسمى هذا النظام نظام العمل.  " },
    { label: "المادة الثانية", text: "يُقصد بالألفاظ الآتية المعاني المبينة أمامها." },
  ],
  ...overrides,
});

describe("library import format", () => {
  it("accepts a law, trims text without rewriting it, and fills defaults", () => {
    const parsed = libraryLawSchema.parse(law({ category: "" }));
    expect(parsed.source).toBe("boe");
    expect(parsed.status).toBe("unknown");
    expect(parsed.category).toBeNull();
    expect(parsed.articles[0].text).toBe("يسمى هذا النظام نظام العمل.");
    expect(parsed.articles[1].text).toBe("يُقصد بالألفاظ الآتية المعاني المبينة أمامها.");
  });

  it.each([
    ["no articles", { articles: [] }],
    ["an empty article", { articles: [{ label: "المادة الأولى", text: "  " }] }],
    ["a duplicate article label", { articles: [{ label: "م1", text: "أ" }, { label: "م1", text: "ب" }] }],
    ["a non-https source", { source_url: "http://laws.boe.gov.sa/x" }],
    ["an unknown status", { status: "draft" }],
    ["an unknown field", { summary: "ملخص" }],
    ["a fetch time without a zone", { fetched_at: "2026-11-01 10:00" }],
  ])("rejects %s", (_, overrides) => {
    expect(libraryLawSchema.safeParse(law(overrides)).success).toBe(false);
  });
});

describe("library search", () => {
  it("normalizes diacritics, alef forms, ta marbuta, alef maqsura, tatweel and spaces", () => {
    expect(normalizeSearch("  نِظَامُ   الإجراءات ")).toBe("نظام الاجراءات");
    expect(normalizeSearch("اللائحة")).toBe(normalizeSearch("اللائحه"));
    expect(normalizeSearch("مـــادة")).toBe("ماده");
    expect(normalizeSearch("على")).toBe("علي");
    expect(normalizeSearch("آلية")).toBe("اليه");
  });

  it("builds a bounded ILIKE pattern with wildcards escaped", () => {
    expect(searchPattern("ا")).toBeNull();
    expect(searchPattern("100%_x")).toBe("%100\\%\\_x%");
    expect(searchPattern("a\\b")).toBe("%a\\\\b%");
    expect(searchPattern("ن".repeat(300))?.length).toBe(102);
  });
});

describe("library source copied into a matter", () => {
  const articles = [
    { position: 1, label: "المادة الأولى", text: "يسمى هذا النظام نظام العمل." },
    { position: 7, label: "المادة السابعة", text: "تسري أحكام هذا النظام على كل عقد." },
  ];

  it("has one citable segment per article, labelled with the article", () => {
    expect(articleSegments(articles)).toEqual([
      { id: "a1", label: "المادة الأولى", text: "يسمى هذا النظام نظام العمل." },
      { id: "a7", label: "المادة السابعة", text: "تسري أحكام هذا النظام على كل عقد." },
    ]);
  });

  it("stores the text with the law's title, source and fetch date, and every article verbatim", () => {
    const text = librarySourceText(
      { title: "نظام العمل", source_url: "https://laws.boe.gov.sa/x", fetched_at: "2026-11-01T10:00:00Z", amended_on: "1/1/1447هـ" },
      articles,
    );
    expect(text).toContain("نظام العمل\nالمصدر: https://laws.boe.gov.sa/x\nتاريخ الجلب: 2026-11-01\nآخر تعديل مذكور في المصدر: 1/1/1447هـ");
    for (const a of articles) expect(text).toContain(`${a.label}\n${a.text}`);
  });

  it("names the file after the law, marks partial copies, and strips path characters", () => {
    expect(librarySourceName("نظام العمل", false)).toBe("نظام العمل.txt");
    expect(librarySourceName("نظام/المرافعات: الشرعية", true)).toBe("نظام-المرافعات- الشرعية (مواد مختارة).txt");
  });
});

describe("library importer", () => {
  it("reads one law or an array of laws per file, and reports bad JSON", () => {
    expect(itemsFromJson("a.json", JSON.stringify(law()))).toHaveLength(1);
    const many = itemsFromJson("b.json", `﻿${JSON.stringify([law(), law({ external_id: "x" })])}`);
    expect(many.map((i) => i.origin)).toEqual(["b.json#1", "b.json#2"]);
    expect(itemsFromJson("c.json", "{ nope")[0].value).toHaveProperty("__parseError");
  });

  it("validates everything, writes valid laws, and keeps going past bad ones", async () => {
    const upsert = vi.fn<Upsert>(async (l) => {
      if (l.external_id === "boom") throw new Error("network down");
      return { id: "id", result: l.external_id === "same" ? "unchanged" : "created" };
    });
    const items = [
      ...itemsFromJson("good.json", JSON.stringify(law())),
      ...itemsFromJson("bad.json", JSON.stringify(law({ external_id: "bad", articles: [] }))),
      ...itemsFromJson("same.json", JSON.stringify(law({ external_id: "same" }))),
      ...itemsFromJson("dup.json", JSON.stringify(law())),
      ...itemsFromJson("boom.json", JSON.stringify(law({ external_id: "boom" }))),
      ...itemsFromJson("broken.json", "{"),
    ];
    const report = await importLaws(items, upsert);
    expect(report.counts).toEqual({ created: 1, updated: 0, unchanged: 1, valid: 0, invalid: 3, failed: 1 });
    expect(upsert).toHaveBeenCalledTimes(3);
    expect(report.outcomes.find((o) => o.origin === "dup.json")?.message).toContain("good.json");
    expect(report.outcomes.find((o) => o.origin === "boom.json")).toMatchObject({ status: "failed", message: "network down" });
    expect(report.outcomes.find((o) => o.origin === "bad.json")?.message).toContain("articles");
  });

  it("a dry run validates and writes nothing", async () => {
    const upsert = vi.fn<Upsert>();
    const report = await importLaws(itemsFromJson("a.json", JSON.stringify([law(), law({ external_id: "b" })])), upsert, { dryRun: true });
    expect(report.counts.valid).toBe(2);
    expect(upsert).not.toHaveBeenCalled();
  });
});
