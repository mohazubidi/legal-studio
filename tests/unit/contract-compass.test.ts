import { describe, expect, it } from "vitest";
import { contractContentSchema } from "@/lib/tools/contract-compass/content";
import type { ContractOutput } from "@/lib/tools/contract-compass/model-schema";
import { buildContractRecord } from "@/lib/tools/contract-compass/record";
import { SAMPLE_CONTRACT as contract, SAMPLE_CONTRACT_REFERENCES as refs, SAMPLE_CONTRACT_SOURCE as source } from "@/lib/tools/contract-compass/sample";
import { amountAppears, clauseAppears, containsDefinitiveConclusion, NEUTRALIZED_NOTE, normalizeNumbers } from "@/lib/tools/contract-compass/verify";
import { AMOUNT_NOT_VERIFIED, buildContractView, findContractItem, NOT_SPECIFIED } from "@/lib/tools/contract-compass/view";
import { parseReviewMarks } from "@/lib/tools/shared/review";
import { resolveSourceLinks } from "@/lib/tools/shared/source-links";

const view = buildContractView(contract, refs);
const DOC = source.documentId;

describe("value verification", () => {
  it("normalises Arabic-Indic digits and thousands separators", () => {
    expect(normalizeNumbers("١٢٠٬٠٠٠ ريال")).toBe("120000 ريال");
    expect(normalizeNumbers("120,000.50")).toBe("120000.50");
    expect(normalizeNumbers("۴۸ ساعة")).toBe("48 ساعة");
  });

  it("accepts an amount only when every number appears in the cited text", () => {
    expect(amountAppears("١٢٠٬٠٠٠", "مقابلًا سنويًا قدره 120,000 ريال")).toBe(true);
    expect(amountAppears("30,000", "مقابلًا سنويًا قدره 120,000 ريال")).toBe(false);
    expect(amountAppears("1200", "قدره 120,000 ريال")).toBe(false); // not a prefix match
  });

  it("accepts a clause reference only when it appears in the cited text", () => {
    expect(clauseAppears("البند الخامس", "البند الخامس: يدفع العميل")).toBe(true);
    expect(clauseAppears("7.2", "وفقًا للبند 7.2 من هذا العقد")).toBe(true);
    expect(clauseAppears("7.2", "وفقًا للبند 7.20")).toBe(false);
    expect(clauseAppears("البند 12", "البند السابع: يلتزم الطرفان")).toBe(false);
  });

  it("detects definitive legal conclusions in Arabic and English, and allows the professional wording", () => {
    for (const text of ["هذا الشرط غير قانوني", "يعدّ باطلًا", "يمثل مخاطر عالية", "بند عالي الخطورة", "This clause is illegal", "high-risk term", "void"]) {
      expect(containsDefinitiveConclusion(text), text).toBe(true);
    }
    for (const text of ["يستحق المراجعة", "قد يترتب عليه أثر تعاقدي", "صياغة تحتاج تحققًا"]) {
      expect(containsDefinitiveConclusion(text), text).toBe(false);
    }
  });
});

describe("sample contract built through the pipeline", () => {
  it("is valid stored content", () => {
    expect(contractContentSchema.safeParse(contract).success).toBe(true);
  });

  it("removes the amount that is not in the contract and says so", () => {
    const quarterly = view.payments.find((p) => p.description.startsWith("قيمة كل دفعة"))!;
    expect(quarterly).toMatchObject({ amount: AMOUNT_NOT_VERIFIED, amountVerified: false, currency: null });
    expect(view.payments.find((p) => p.amountVerified)).toMatchObject({ amount: "120,000", currency: "ريال سعودي" });
  });

  it("removes a clause number that does not appear in the cited text", () => {
    const confidentiality = view.matrix.find((o) => o.obligation.includes("سرية"))!;
    expect(confidentiality.clause).toBeNull();
    expect(view.matrix.find((o) => o.obligation.includes("الاستجابة"))!.clause).toBe("البند الرابع");
  });

  it("replaces a definitive conclusion with neutral wording and the wording-check label", () => {
    const item = view.review.find((r) => r.topic.includes("استبعاد المسؤولية"))!;
    expect(item).toMatchObject({ note: NEUTRALIZED_NOTE, noteReplaced: true, label: "صياغة تحتاج تحققًا" });
    expect(view.review.every((r) => !containsDefinitiveConclusion(r.note))).toBe(true);
    expect(contract.warnings.join(" ")).toContain("استُبدل 1");
  });
});

describe("extraction display", () => {
  it("shows every term, stating explicitly when the contract does not", () => {
    expect(view.terms).toHaveLength(8);
    const termination = view.terms.find((t) => t.key === "termination")!;
    expect(termination).toMatchObject({ status: "not_stated", value: NOT_SPECIFIED, statusLabel: "غير منصوص عليه في العقد", links: [] });
  });

  it("shows the governing law only as explicitly stated, with its clause", () => {
    const law = view.terms.find((t) => t.key === "governing_law")!;
    expect(law).toMatchObject({ status: "stated", clause: "البند الثامن", referenced: true });
    expect(law.value).toContain("المملكة العربية السعودية");
  });

  it("keeps the effective date as written and flags the Gregorian conversion", () => {
    expect(contract.terms.effective_date.date).toMatchObject({ text: "1446/01/01هـ", converted: true });
    expect(view.terms.find((t) => t.key === "effective_date")!.value).toMatch(/^1446\/01\/01هـ \(≈ \u2066\d{4}-\d{2}-\d{2}\u2069 م\)/);
  });

  it("builds the obligations matrix: obligation, responsible party, deadline, clause, source", () => {
    const response = view.matrix.find((o) => o.obligation.includes("الاستجابة"))!;
    expect(response).toMatchObject({ responsible: ["شركة المدار للتقنية"], deadline: "خلال 48 ساعة من الإبلاغ", clause: "البند الرابع" });
    expect(response.links[0]).toMatchObject({ documentId: DOC, location: "صفحة 2" });
    const shared = view.matrix.find((o) => o.obligation.includes("سرية"))!;
    expect(shared.responsible).toEqual(["شركة المدار للتقنية", "شركة الرواسي القابضة"]);
  });

  it("lists deadlines with dated items first, then relative periods, without inventing dates", () => {
    expect(view.deadlines[0]).toMatchObject({ kind: "term", label: "تاريخ السريان" });
    expect(view.deadlines[0].iso).not.toBeNull();
    expect(view.deadlines.slice(1).every((d) => d.iso === null)).toBe(true);
    expect(view.deadlines.find((d) => d.kind === "notice")).toMatchObject({ when: "ثلاثين يومًا", clause: "البند الثالث" });
  });

  it("counts items per view", () => {
    expect(view.counts).toMatchObject({ obligations: 3, financial: 2, review: 2 });
    expect(view.counts.snapshot).toBe(view.terms.filter((t) => t.status === "stated").length);
  });
});

describe("source linking", () => {
  it("links an obligation to its document, page and excerpt, with the clause and responsible party", () => {
    const id = view.matrix.find((o) => o.obligation.includes("الاستجابة"))!.id;
    const item = findContractItem(view, id)!;
    expect(item.kindLabel).toBe("التزام");
    expect(item.links).toEqual([
      expect.objectContaining({
        documentId: DOC,
        documentName: "عقد تقديم خدمات صيانة (مثال).pdf",
        location: "صفحة 2",
        excerpt: "يلتزم مقدم الخدمة بالاستجابة لطلبات الصيانة خلال 48 ساعة من الإبلاغ",
        href: `/api/documents/${DOC}/download`,
      }),
    ]);
    expect(item.meta).toEqual(expect.arrayContaining([{ label: "البند", value: "البند الرابع" }, { label: "الطرف المسؤول", value: "شركة المدار للتقنية" }]));
  });

  it("links terms by id and keeps AI interpretation separate from extracted text", () => {
    expect(findContractItem(view, "term:governing_law")!.links[0].location).toBe("صفحة 4");
    const review = findContractItem(view, view.review[0].id)!;
    expect(review.detail).toBeNull();
    expect(review.interpretation).toBe(view.review[0].note);
  });

  it("shows no source, rather than an invented one, for items without verified citations", () => {
    const missing = view.missing.find((m) => m.text.includes("الإنهاء"))!;
    const item = findContractItem(view, missing.id)!;
    expect(item.referenced).toBe(false);
    expect(item.links).toEqual([]);
    expect(findContractItem(view, "nope")).toBeNull();
  });

  it("numbers references uniquely and skips references that no longer exist", () => {
    const numbers = view.matrix.flatMap((o) => o.links.map((l) => l.number));
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(resolveSourceLinks(["00000000-0000-4000-8000-000000000000"], refs, new Map(), new Map())).toEqual([]);
  });
});

describe("record rules", () => {
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const noDate = { text: "", calendar: "unknown" as const, year: 0, month: 0, day: 0 };
  const term = (status: "stated" | "not_stated" | "unclear", citations: ContractOutput["parties"][number]["citations"] = []) => ({ status, summary: "x", clause_ref: "", citations });
  const base: ContractOutput = {
    parties: [],
    terms: {
      effective_date: { ...term("not_stated"), date: noDate },
      duration: term("stated"), // claimed but uncited
      renewal: term("not_stated"),
      termination: term("not_stated"),
      confidentiality: term("not_stated"),
      liability: term("not_stated"),
      dispute_resolution: term("not_stated"),
      governing_law: term("stated"), // claimed but uncited: must not be shown
    },
    notice_periods: [{ purpose: "إخطار", period_text: "تسعين يومًا", clause_ref: "", citations: [{ source_id: "S1", segment_id: "p2", quote: "قبل ثلاثين يومًا من انتهاء المدة" }] }],
    payments: [],
    obligations: [
      {
        description: "الاستجابة",
        responsible_party_keys: ["P9"],
        deadline_text: "خلال 24 ساعة",
        deadline_date: { text: "2025-01-01", calendar: "gregorian", year: 2025, month: 1, day: 1 },
        clause_ref: "",
        citations: [{ source_id: "S1", segment_id: "p2", quote: "يلتزم مقدم الخدمة بالاستجابة لطلبات الصيانة" }],
      },
    ],
    review_items: [{ topic: "بند", clause_ref: "", note: "هذا البند باطل", label: "worth_review", citations: [] }],
    missing_information: [],
  };
  const build = (knowledgeSource: string | null = null) =>
    buildContractRecord({ output: base, source, snapshot: [], model: "m", now: "2026-01-01T00:00:00Z", newId, knowledgeSource }).content;

  it("never shows an uncited governing law, and marks other uncited terms unverified", () => {
    const content = build();
    expect(content.terms.governing_law.status).toBe("not_stated");
    expect(content.terms.duration.status).toBe("unverified");
    expect(content.missing.some((m) => m.text.includes("مدة العقد"))).toBe(true);
  });

  it("drops deadlines, dates, periods and party links not supported by the cited text", () => {
    const content = build();
    expect(content.obligations[0]).toMatchObject({ deadline_text: null, deadline_date: null, responsible_party_ids: [] });
    expect(content.notice_periods).toHaveLength(0); // "تسعين يومًا" is not in the cited text
  });

  it("allows the model's wording only when a legal knowledge source is configured", () => {
    expect(build().review_items[0]).toMatchObject({ note: NEUTRALIZED_NOTE, note_replaced: true });
    expect(build("vetted-source").review_items[0]).toMatchObject({ note: "هذا البند باطل", note_replaced: false });
  });
});

describe("review marks", () => {
  it("keeps valid marks and ignores malformed ones", () => {
    const marks = parseReviewMarks({
      a: { status: "verified", note: "ok", by: "u", at: "t" },
      b: { status: "approved", by: "u", at: "t" },
      c: "x",
    });
    expect(Object.keys(marks)).toEqual(["a"]);
    expect(parseReviewMarks(null)).toEqual({});
  });
});
