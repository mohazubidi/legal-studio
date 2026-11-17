import { describe, expect, it } from "vitest";
import type { IndexedSource } from "@/lib/tools/shared/citations";
import type { SourceSnapshot } from "@/lib/tools/shared/sources";
import { contentSchema, type LegalContent } from "@/lib/tools/legal-content/content";
import { BRAND_PLACEHOLDER, brandMonogram, CANVAS, CONTENT_DISCLAIMER } from "@/lib/tools/legal-content/design";
import { applyContentEdits, contentEditsSchema, editsFromContent, type ContentEdits } from "@/lib/tools/legal-content/edits";
import { CONTENT_FORMATS, FORMAT_SPECS } from "@/lib/tools/legal-content/formats";
import { guardAiText, emptyStats, unsupportedReferences } from "@/lib/tools/legal-content/guard";
import type { ContentModelOutput } from "@/lib/tools/legal-content/model-schema";
import { buildContentPrompt } from "@/lib/tools/legal-content/prompt";
import { buildContentRecord } from "@/lib/tools/legal-content/record";
import { buildContentView, contentToText, exportFileName } from "@/lib/tools/legal-content/view";

const DOC = "11111111-1111-4111-8111-111111111111";
const SEGMENT =
  "المادة 77: يجوز لصاحب العمل إنهاء العقد بإشعار مكتوب قبل ستين يومًا. ويستحق العامل تعويضًا عن مدة الإشعار وفق نظام العمل.";
const SOURCES: IndexedSource[] = [{ sourceId: "S1", documentId: DOC, fileName: "تحديث نظام العمل.txt", segments: [{ id: "s1", label: "فقرة 1", text: SEGMENT }] }];
const SNAPSHOT: SourceSnapshot[] = [
  { document_id: DOC, label: "S1", file_name: "تحديث نظام العمل.txt", source_kind: "regulation_update", processing_status: "processed", processing_error: null, included: true },
];
const QUOTE = "يجوز لصاحب العمل إنهاء العقد بإشعار مكتوب قبل ستين يومًا";
const cite = (quote: string) => [{ source_id: "S1", segment_id: "s1", quote }];
const expl = (text: string) => ({ kind: "explanation" as const, text, citations: [] });
const quote = (text: string) => ({ kind: "source_quote" as const, text, citations: cite(text) });

function counter() {
  let n = 0;
  return () => `id-${++n}`;
}

function build(format: (typeof CONTENT_FORMATS)[number], output: ContentModelOutput) {
  return buildContentRecord({ format, output, sources: SOURCES, snapshot: SNAPSHOT, firmName: "مكتب الريادة للمحاماة", model: "test-model", now: "2026-11-17T10:00:00.000Z", newId: counter() });
}

const carouselOutput = (): ContentModelOutput => ({
  title: "تعديل مدة الإشعار في نظام العمل",
  cards: [
    // Deliberately out of order, with an unknown section and a duplicate.
    { role: "takeaway", heading: "الخلاصة", blocks: [expl("راجع مدة الإشعار في عقود العمل القائمة عند الحاجة.")] },
    { role: "cover", heading: "ما الذي تغيّر؟", blocks: [expl("قراءة سريعة في التحديث.")] },
    { role: "context", heading: "السياق", blocks: [expl("صدر تحديث يتناول إنهاء عقد العمل.")] },
    { role: "key_point", heading: "النص", blocks: [quote(QUOTE), { kind: "source_quote", text: "يجوز إنهاء العقد فورًا دون إشعار", citations: cite("يجوز إنهاء العقد فورًا دون إشعار") }] },
    { role: "explanation", heading: "الشرح", blocks: [expl("يحتاج الإنهاء إلى إشعار مكتوب. وتنص المادة 99 على غرامة إضافية.")] },
    { role: "implication", heading: "الأثر", blocks: [expl("قد يتغيّر حساب التعويض. ويجب عليك رفع دعوى فورًا.")] },
    { role: "bonus", heading: "إضافي", blocks: [expl("نص خارج القالب")] },
    { role: "context", heading: "سياق مكرر", blocks: [expl("مكرر")] },
  ],
});

describe("content formats and design system", () => {
  it("defines all six output types with limits that fit their cards", () => {
    expect([...CONTENT_FORMATS].sort()).toEqual(["awareness_post", "carousel", "client_update", "faq", "legal_alert", "linkedin_post"]);
    for (const format of CONTENT_FORMATS) {
      const spec = FORMAT_SPECS[format];
      expect(spec.roles.length).toBeGreaterThan(0);
      for (const role of spec.roles) {
        expect(role.maxHeading).toBeGreaterThan(0);
        expect(role.maxBody).toBeGreaterThan(0);
        expect(role.maxBlocks).toBeGreaterThan(0);
      }
      // Every format needs at least one section where the supplied text is quoted.
      expect(spec.roles.some((r) => r.quote !== "none")).toBe(true);
    }
  });

  it("uses one token set per layout: fixed canvases for slides and cards, A4 for documents", () => {
    expect(CANVAS.slides).toMatchObject({ width: 1080, height: 1350 });
    expect(CANVAS.card).toMatchObject({ width: 1080, height: 1080 });
    expect(CANVAS.document).toMatchObject({ width: 794, height: null });
    for (const tokens of Object.values(CANVAS)) {
      // Title hierarchy: display > heading > body > meta.
      expect(tokens.type.display).toBeGreaterThan(tokens.type.heading);
      expect(tokens.type.heading).toBeGreaterThan(tokens.type.body);
      expect(tokens.type.body).toBeGreaterThan(tokens.type.meta);
    }
    expect(brandMonogram("مكتب الريادة")).toBe("مر");
    expect(brandMonogram("")).toBe("م");
  });

  it("describes the fixed template to the model, including the carousel order", () => {
    const prompt = buildContentPrompt("carousel", SOURCES);
    const order = [...prompt.matchAll(/<section role="([a-z_]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["cover", "context", "key_point", "explanation", "implication", "takeaway"]);
    expect(prompt).toContain('<source id="S1"');
  });
});

describe("building content from model output", () => {
  it("carousel: seven slides in the fixed order, the last one the source", () => {
    const { content } = build("carousel", carouselOutput());
    expect(content.cards.map((c) => c.role)).toEqual(["cover", "context", "key_point", "explanation", "implication", "takeaway", "source"]);
    expect(content.cards.find((c) => c.role === "context")?.heading).toBe("السياق");
    expect(content.warnings.some((w) => w.includes("خارج بنية القالب"))).toBe(true);
    expect(contentSchema.safeParse(content).success).toBe(true);
  });

  it("keeps a verbatim quote with its verified reference and drops an invented one", () => {
    const { content, references } = build("carousel", carouselOutput());
    const key = content.cards.find((c) => c.role === "key_point")!;
    expect(key.blocks).toHaveLength(1);
    expect(key.blocks[0]).toMatchObject({ kind: "source_quote", text: QUOTE });
    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({ document_id: DOC, page_or_section: "فقرة 1", source_text: QUOTE });
    expect(key.blocks[0].reference_ids).toEqual([references[0].id]);
    expect(content.warnings.some((w) => w.includes("استُبعد 1 اقتباسًا"))).toBe(true);
  });

  it("removes AI sentences citing articles, numbers or regulations absent from the input, and advice", () => {
    const { content } = build("carousel", carouselOutput());
    const explanation = content.cards.find((c) => c.role === "explanation")!.blocks[0];
    expect(explanation).toMatchObject({ kind: "explanation", text: "يحتاج الإنهاء إلى إشعار مكتوب." });
    const implication = content.cards.find((c) => c.role === "implication")!.blocks[0];
    expect(implication.text).toBe("قد يتغيّر حساب التعويض.");
    expect(content.warnings.some((w) => w.includes("غير وارد في النص المُدخل"))).toBe(true);
    expect(content.warnings.some((w) => w.includes("نصيحة"))).toBe(true);
  });

  it("checks references against the supplied text only", () => {
    expect(unsupportedReferences("تنص المادة 77 على الإشعار.", SEGMENT)).toEqual([]);
    expect(unsupportedReferences("وفق نظام العمل.", SEGMENT)).toEqual([]);
    expect(unsupportedReferences("وفق نظام الإفلاس.", SEGMENT)).toEqual(["نظام الافلاس"]);
    expect(unsupportedReferences("يطبق النظام الجديد على العقود.", SEGMENT)).toEqual([]);
    expect(unsupportedReferences("خلال 90 يومًا.", SEGMENT)).toEqual(["90"]);
    expect(guardAiText("الإنهاء يحتاج إشعارًا. هذا الشرط باطل.", SEGMENT, emptyStats())).toBe("الإنهاء يحتاج إشعارًا.");
  });

  it("flags a section the model left empty instead of filling it", () => {
    const output = carouselOutput();
    output.cards = output.cards.filter((c) => c.role !== "takeaway");
    const { content } = build("carousel", output);
    const takeaway = content.cards.find((c) => c.role === "takeaway")!;
    expect(takeaway).toMatchObject({ missing: true, heading: "", blocks: [] });
    expect(content.warnings.some((w) => w.includes("بلا محتوى صالح"))).toBe(true);
  });

  it("builds the source section and attribution from the sources, never from the model", () => {
    const { content } = build("carousel", carouselOutput());
    const source = content.cards.at(-1)!;
    expect(source).toMatchObject({ role: "source", blocks: [] });
    expect(content.attribution.sources).toEqual([{ document_id: DOC, file_name: "تحديث نظام العمل.txt", kind_label: "تحديث تنظيمي" }]);
    expect(content.attribution.display).toBe("تحديث نظام العمل (تحديث تنظيمي)");
    expect(content.brand.firm_name).toBe("مكتب الريادة للمحاماة");
  });

  it("FAQ: pads to the minimum number of questions and trims above the maximum", () => {
    const qa = (n: number) => ({ role: "qa", heading: `سؤال ${n}؟`, blocks: [expl("جواب مستند إلى النص.")] });
    const few = build("faq", { title: "أسئلة", cards: [qa(1)] }).content;
    expect(few.cards.filter((c) => c.role === "qa")).toHaveLength(3);
    expect(few.cards.filter((c) => c.missing)).toHaveLength(2);
    const many = build("faq", { title: "أسئلة", cards: Array.from({ length: 9 }, (_, i) => qa(i + 1)) }).content;
    expect(many.cards.filter((c) => c.role === "qa")).toHaveLength(6);
  });

  it("trims AI text to the section's space and drops a quote that does not fit", () => {
    const long = "شرح ".repeat(200).trim();
    const { content } = build("awareness_post", {
      title: "تذكير",
      cards: [
        { role: "key_message", heading: "الرسالة", blocks: [expl(long)] },
        { role: "explanation", heading: "التوضيح", blocks: [quote(QUOTE)] },
        { role: "tip", heading: "للتذكير", blocks: [expl("اقرأ العقد.")] },
      ],
    });
    const message = content.cards.find((c) => c.role === "key_message")!.blocks[0];
    expect(message.text.length).toBeLessThanOrEqual(FORMAT_SPECS.awareness_post.roles[0].maxBody);
    expect(content.warnings.some((w) => w.includes("اختُصر"))).toBe(true);
  });
});

describe("editing content", () => {
  const base = () => build("carousel", carouselOutput());
  const at = (edits: ContentEdits, role: string, content: LegalContent) => edits.cards.findIndex((c) => c.id === content.cards.find((x) => x.role === role)!.id);

  it("round-trips unchanged content", () => {
    const { content, references } = base();
    const result = applyContentEdits(content, editsFromContent(content), references, "2026-11-17T11:00:00.000Z", counter());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.cards).toEqual(content.cards);
      expect(result.content.title_by).toBe("ai");
      expect(result.content.last_edited_at).toBe("2026-11-17T11:00:00.000Z");
    }
  });

  it("edited AI text becomes the lawyer's text; a new paragraph is the lawyer's; removal works", () => {
    const { content, references } = base();
    const edits = editsFromContent(content);
    const i = at(edits, "explanation", content);
    edits.cards[i].blocks[0].text = "صياغة المحامي للشرح.";
    edits.cards[i].blocks.push({ id: null, text: "فقرة جديدة من المحامي." });
    const j = at(edits, "takeaway", content);
    edits.cards[j].blocks = [];
    const result = applyContentEdits(content, edits, references, "now", counter());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const card = result.content.cards.find((c) => c.role === "explanation")!;
    expect(card.blocks.map((b) => [b.kind, b.edited_from, b.text])).toEqual([
      ["lawyer", "explanation", "صياغة المحامي للشرح."],
      ["lawyer", null, "فقرة جديدة من المحامي."],
    ]);
    expect(result.content.cards.find((c) => c.role === "takeaway")!.blocks).toEqual([]);
    expect(contentSchema.safeParse(result.content).success).toBe(true);
  });

  it("a shortened quote that is still verbatim stays a quote; reworded, it loses the citation", () => {
    const { content, references } = base();
    const edits = editsFromContent(content);
    const i = at(edits, "key_point", content);
    edits.cards[i].blocks[0].text = "إنهاء العقد بإشعار مكتوب";
    let result = applyContentEdits(content, edits, references, "now", counter());
    expect(result.ok && result.content.cards.find((c) => c.role === "key_point")!.blocks[0]).toMatchObject({ kind: "source_quote", reference_ids: [references[0].id] });

    edits.cards[i].blocks[0].text = "يمكن لصاحب العمل إنهاء العقد في أي وقت";
    result = applyContentEdits(content, edits, references, "now", counter());
    expect(result.ok && result.content.cards.find((c) => c.role === "key_point")!.blocks[0]).toMatchObject({
      kind: "lawyer",
      edited_from: "source_quote",
      reference_ids: [],
    });
  });

  it("rejects structural changes, empty title or source, and text that does not fit", () => {
    const { content, references } = base();
    const reject = (mutate: (e: ContentEdits) => void, message: RegExp) => {
      const edits = editsFromContent(content);
      mutate(edits);
      const result = applyContentEdits(content, edits, references, "now", counter());
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(message);
    };
    reject((e) => e.cards.reverse(), /بنية المحتوى ثابتة/);
    reject((e) => e.cards.pop(), /بنية المحتوى ثابتة/);
    reject((e) => (e.title = "  "), /العنوان مطلوب/);
    reject((e) => (e.attribution = ""), /حقل المصدر مطلوب/);
    reject((e) => (e.cards[1].blocks = [{ id: null, text: "ن".repeat(400) }]), /أطول من مساحة القالب/);
    reject((e) => (e.cards[1].blocks = [1, 2, 3].map((n) => ({ id: null, text: `فقرة ${n}` }))), /فقرات على الأكثر/);
    reject((e) => (e.cards[0].blocks = [{ id: "no-such-block", text: "x" }]), /غير موجود/);
  });

  it("validates the shape of submitted edits", () => {
    expect(contentEditsSchema.safeParse({ title: "x", firm_name: "", attribution: "y", cards: [], extra: 1 }).success).toBe(false);
    expect(contentEditsSchema.safeParse({ title: "x", firm_name: "", attribution: "y", cards: [] }).success).toBe(true);
  });
});

describe("preview and export text", () => {
  it("shows each quote with its location and always includes the source and the disclaimer", () => {
    const { content, references } = build("carousel", carouselOutput());
    const view = buildContentView(content, references);
    const key = view.cards.find((c) => c.role === "key_point")!;
    expect(key.blocks[0].citation).toBe("تحديث نظام العمل · فقرة 1");
    expect(view.cards.at(-1)!.sourceLines).toEqual(["تحديث نظام العمل · فقرة 1"]);

    const text = contentToText(view);
    expect(text).toContain(`«${QUOTE}» (تحديث نظام العمل · فقرة 1)`);
    expect(text).toContain("المصدر: تحديث نظام العمل (تحديث تنظيمي)");
    expect(text).toContain(CONTENT_DISCLAIMER);
    expect(text).not.toContain("المادة 99");
  });

  it("a quote whose reference is missing loses its citation rather than gaining one", () => {
    const { content } = build("carousel", carouselOutput());
    const view = buildContentView(content, []);
    expect(view.cards.find((c) => c.role === "key_point")!.blocks[0].citation).toBeNull();
  });

  it("makes a safe file name", () => {
    expect(exportFileName('تنبيه: "نظام" / جديد', "txt")).toBe("تنبيه نظام جديد.txt");
    expect(exportFileName("", "txt")).toBe("legal-content.txt");
    expect(BRAND_PLACEHOLDER).toBe("اسم المكتب");
  });
});
