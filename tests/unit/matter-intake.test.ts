import { describe, expect, it } from "vitest";
import { intakeContentSchema, type IntakeContent } from "@/lib/tools/matter-intake/content";
import { applyBriefEdits, briefEditsSchema, editsFromContent, prepareMatterFromBrief, suggestMatterName } from "@/lib/tools/matter-intake/edits";
import { formatIntakeAnswers, intakeFormSchema } from "@/lib/tools/matter-intake/form";
import { UNSUPPORTED_NOTE } from "@/lib/tools/matter-intake/record";
import { SAMPLE_FORM, SAMPLE_INTAKE as brief, SAMPLE_INTAKE_REFERENCES as refs } from "@/lib/tools/matter-intake/sample";
import { containsLegalAdvice, stripLegalAdvice } from "@/lib/tools/shared/language-guard";

const validForm = { client_name: "  أحمد علي  ", client_type: "individual", description: "وصف كافٍ للمسألة يتجاوز عشرين حرفًا بوضوح." };

describe("intake form validation", () => {
  it("accepts a minimal valid form and trims values", () => {
    const parsed = intakeFormSchema.parse(validForm);
    expect(parsed.client_name).toBe("أحمد علي");
    expect(parsed.amounts).toBe("");
  });

  it.each([
    [{ ...validForm, client_name: " " }, "اسم العميل مطلوب."],
    [{ ...validForm, description: "قصير" }, "صف المسألة في 20 حرفًا على الأقل."],
    [{ ...validForm, client_type: "alien" }, "صفة العميل غير صالحة."],
    [{ ...validForm, amounts: "x".repeat(2001) }, "النص أطول من الحد المسموح (2000 حرف)."],
  ])("rejects invalid input with a clear message", (input, message) => {
    const result = intakeFormSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.issues[0].message).toBe(message);
  });

  it("rejects unknown fields", () => {
    expect(intakeFormSchema.safeParse({ ...validForm, is_admin: true }).success).toBe(false);
  });

  it("segments answers one question per citable section", async () => {
    const { segmentQuestionAnswers } = await import("@/lib/documents/extraction");
    const segments = segmentQuestionAnswers(formatIntakeAnswers(SAMPLE_FORM));
    expect(segments).toHaveLength(11);
    expect(segments[0]).toMatchObject({ id: "q1", label: "سؤال: اسم العميل" });
    expect(segments[0].text).toBe("السؤال: اسم العميل\nالإجابة: مؤسسة الريادة للمقاولات");
  });

  it("stores answers verbatim and records unanswered questions explicitly", () => {
    const text = formatIntakeAnswers(SAMPLE_FORM);
    expect(text).toContain("الإجابة: تعاقدنا مع شركة البنيان على توريد حديد تسليح");
    expect(text).toContain("السؤال: ما الذي يريده العميل؟\nالإجابة: لم تُقدَّم إجابة.");
  });
});

describe("matter brief (sample built through the pipeline)", () => {
  it("is valid stored content", () => {
    expect(intakeContentSchema.safeParse(brief).success).toBe(true);
  });

  it("keeps the client's words as verified quotes, separate from the organised value", () => {
    expect(brief.fields.client).toMatchObject({ value: "مؤسسة الريادة للمقاولات", status: "stated" });
    const quote = refs.find((r) => r.id === brief.fields.client.reference_ids[0]);
    expect(quote?.source_text).toBe("مؤسسة الريادة للمقاولات");
    expect(brief.fields.relationship.value).not.toBe(refs.find((r) => r.id === brief.fields.relationship.reference_ids[0])?.source_text);
  });

  it("marks unsupported 'stated' fields as inferred, and keeps inferred fields labelled", () => {
    expect(brief.fields.requested_outcome).toMatchObject({ status: "inferred", note: UNSUPPORTED_NOTE, reference_ids: [] });
    expect(brief.fields.matter_type.status).toBe("inferred");
  });

  it("drops amounts and dates that are not in the client's text", () => {
    expect(brief.amounts.map((a) => a.amount_text)).toEqual(["200,000"]);
    expect(brief.key_events.find((e) => e.description.startsWith("وصول"))?.date).toBeNull();
    expect(brief.warnings.join(" ")).toContain("حُذف 1");
  });

  it("removes legal advice from AI-written text", () => {
    expect(brief.summary.text).not.toContain("ننصح");
    expect(brief.warnings.join(" ")).toContain("نصيحة قانونية");
    expect(containsLegalAdvice("ننصح العميل برفع دعوى")).toBe(true);
    expect(containsLegalAdvice("ما الكمية المتعاقد عليها؟")).toBe(false);
    expect(stripLegalAdvice("وصل نصف الكمية. من حقك المطالبة بالتعويض.").text).toBe("وصل نصف الكمية.");
  });

  it("lists uploaded files from the sources, and reports the untranscribed recording", () => {
    const audio = brief.documents_received.find((d) => d.origin === "uploaded");
    expect(audio).toMatchObject({ description: "مكالمة العميل (مثال).m4a", provided: false });
    expect(brief.missing_information.some((m) => m.text.includes("التفريغ الصوتي غير متاح"))).toBe(true);
    expect(brief.documents_received.filter((d) => d.origin === "mentioned")).toHaveLength(2);
  });

  it("includes contradictions, clarification questions and a questionnaire", () => {
    expect(brief.contradictions[0].statements).toHaveLength(2);
    expect(brief.clarification_questions.length).toBeGreaterThan(0);
    expect(brief.questionnaire.flatMap((s) => s.questions).map((q) => q.answer_type)).toContain("document");
  });
});

describe("brief edit validation", () => {
  const base = editsFromContent(brief);

  it("accepts the brief as it is", () => {
    expect(briefEditsSchema.safeParse(base).success).toBe(true);
  });

  it("never lets a missing field be silently filled or hidden", () => {
    const filledButNotProvided = { ...base, fields: { ...base.fields, client: { value: "شخص", status: "not_provided" as const } } };
    expect(briefEditsSchema.safeParse(filledButNotProvided).success).toBe(false);
    const emptyButStated = { ...base, fields: { ...base.fields, client: { value: "", status: "stated" as const } } };
    expect(briefEditsSchema.safeParse(emptyButStated).success).toBe(false);
  });

  it("rejects unknown keys and empty list items", () => {
    expect(briefEditsSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
    expect(briefEditsSchema.safeParse({ ...base, missing_documents: [{ document: " ", reason: "" }] }).success).toBe(false);
  });

  it("marks an edited value as the lawyer's, not the client's", () => {
    const edits = briefEditsSchema.parse({ ...base, fields: { ...base.fields, client: { value: "مؤسسة الريادة للمقاولات المحدودة", status: "stated" } } });
    const next = applyBriefEdits(brief, edits, "2026-02-01T00:00:00Z", () => "new-id");
    expect(next.fields.client).toMatchObject({ status: "confirmed", reference_ids: [] });
    expect(next.fields.relationship).toBe(brief.fields.relationship); // untouched fields keep their quotes
    expect(next.last_edited_at).toBe("2026-02-01T00:00:00Z");
  });

  it("lets the reviewer confirm an inferred field without changing it", () => {
    const edits = briefEditsSchema.parse({ ...base, fields: { ...base.fields, matter_type: { value: brief.fields.matter_type.value, status: "confirmed" } } });
    expect(applyBriefEdits(brief, edits, "t", () => "x").fields.matter_type.status).toBe("confirmed");
  });
});

describe("matter creation from the brief", () => {
  it("builds the matter from the reviewed brief", () => {
    const result = prepareMatterFromBrief(brief, { matter_name: suggestMatterName(brief) });
    expect(result).toMatchObject({
      ok: true,
      matter: { matter_name: "مؤسسة الريادة للمقاولات ضد شركة البنيان للتوريد", client_name: "مؤسسة الريادة للمقاولات", matter_type: "نزاع تجاري حول تنفيذ عقد توريد", status: "active" },
    });
    expect(result.ok && result.matter.description).toContain("ملخص الاستقبال");
  });

  it("does not invent a requested outcome or matter type the brief does not have", () => {
    const content: IntakeContent = {
      ...brief,
      fields: {
        ...brief.fields,
        requested_outcome: { value: "", status: "not_provided", reference_ids: [], note: null },
        matter_type: { value: "", status: "not_provided", reference_ids: [], note: null },
      },
    };
    const result = prepareMatterFromBrief(content, { matter_name: "ملف" });
    expect(result.ok && result.matter.matter_type).toBeNull();
    expect(result.ok && result.matter.description).toContain("النتيجة المطلوبة: لم يُقدَّم");
  });

  it("requires a client and a matter name, and refuses a brief already used", () => {
    const noClient: IntakeContent = { ...brief, fields: { ...brief.fields, client: { value: "", status: "not_provided", reference_ids: [], note: null } } };
    expect(prepareMatterFromBrief(noClient, { matter_name: "ملف" })).toEqual({ ok: false, message: "حدّد العميل في الملخص قبل إنشاء الملف." });
    expect(prepareMatterFromBrief(brief, { matter_name: "  " })).toMatchObject({ ok: false, message: "اسم الملف مطلوب." });
    const used = { ...brief, finalized: { matter_id: "e1e1a0a0-0000-4000-8000-000000000009", at: "t" } };
    expect(prepareMatterFromBrief(used, { matter_name: "ملف" }).ok).toBe(false);
  });
});

describe("review fixes", () => {
  it("does not treat neutral obligations as advice, but still catches advice", async () => {
    const { containsLegalAdvice, stripLegalAdvice } = await import("@/lib/tools/shared/language-guard");
    for (const neutral of ["يجب على كلا الطرفين تقديم المستندات.", "يجب على كل طرف الإخطار كتابيًا.", "ما المستندات المتوفرة لديك؟"]) {
      expect(containsLegalAdvice(neutral), neutral).toBe(false);
    }
    for (const advice of ["يجب عليك رفع دعوى.", "يجب على العميل التوقف عن السداد.", "ننصح العميل برفع دعوى.", "يجب على ك ذلك"]) {
      expect(containsLegalAdvice(advice), advice).toBe(true);
    }
    expect(stripLegalAdvice("يجب على كلا الطرفين التسليم. ننصح بالمطالبة.")).toEqual({ text: "يجب على كلا الطرفين التسليم.", removed: 1 });
  });

  it("does not accept the intake status on the general create/update path", async () => {
    const { matterCreateSchema, matterUpdateSchema } = await import("@/lib/validation/schemas");
    expect(matterCreateSchema.safeParse({ matter_name: "x", status: "intake" }).success).toBe(false);
    expect(matterUpdateSchema.safeParse({ status: "intake" }).success).toBe(false);
    expect(matterCreateSchema.safeParse({ matter_name: "x", status: "active" }).success).toBe(true);
  });
});
