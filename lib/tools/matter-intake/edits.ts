import { z } from "zod";
import { matterCreateSchema } from "@/lib/validation/schemas";
import { FIELD_STATUSES, NOT_PROVIDED, type IntakeContent } from "./content";
import { ANSWER_TYPES } from "./model-schema";

/**
 * Reviewer edits to the brief, validated on the server. A field is either
 * empty and "not_provided", or has a value and any other status: missing data
 * is never filled silently, and a value can never hide behind "not_provided".
 */
const text = (max: number) => z.string().trim().max(max, `النص أطول من الحد المسموح (${max}).`);

export const briefFieldEditSchema = z
  .object({ value: text(2000), status: z.enum(FIELD_STATUSES) })
  .superRefine((field, ctx) => {
    if (!field.value && field.status !== "not_provided") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "الحقل الفارغ يجب أن يُوسم «لم يُقدَّم»." });
    }
    if (field.value && field.status === "not_provided") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "لا يمكن وسم حقل له قيمة بأنه «لم يُقدَّم»." });
    }
  });

export const briefEditsSchema = z
  .object({
    summary: text(10_000),
    fields: z.object({ client: briefFieldEditSchema, relationship: briefFieldEditSchema, matter_type: briefFieldEditSchema, requested_outcome: briefFieldEditSchema }),
    other_parties: z.array(z.object({ id: z.string().max(60).optional(), name: text(200).min(1, "اسم الطرف مطلوب."), role: text(200), status: z.enum(FIELD_STATUSES) })).max(100),
    missing_information: z.array(z.object({ id: z.string().max(60).optional(), text: text(1000).min(1, "عنصر فارغ.") })).max(200),
    missing_documents: z.array(z.object({ id: z.string().max(60).optional(), document: text(300).min(1, "عنصر فارغ."), reason: text(1000) })).max(200),
    clarification_questions: z.array(z.object({ id: z.string().max(60).optional(), question: text(1000).min(1, "سؤال فارغ."), reason: text(1000) })).max(200),
    questionnaire: z
      .array(
        z.object({
          id: z.string().max(60).optional(),
          section: text(200).min(1, "عنوان القسم مطلوب."),
          questions: z.array(z.object({ id: z.string().max(60).optional(), question: text(1000).min(1, "سؤال فارغ."), purpose: text(1000), answer_type: z.enum(ANSWER_TYPES) })).max(100),
        }),
      )
      .max(50),
  })
  .strict();

export type BriefEdits = z.input<typeof briefEditsSchema>;

/** The editable part of a brief, as the editor starts from it. */
export function editsFromContent(content: IntakeContent): BriefEdits {
  return {
    summary: content.summary.text,
    fields: Object.fromEntries(Object.entries(content.fields).map(([key, f]) => [key, { value: f.value, status: f.status }])) as BriefEdits["fields"],
    other_parties: content.other_parties.map((p) => ({ id: p.id, name: p.name, role: p.role, status: p.status })),
    missing_information: content.missing_information.map((m) => ({ id: m.id, text: m.text })),
    missing_documents: content.missing_documents.map((d) => ({ id: d.id, document: d.document, reason: d.reason })),
    clarification_questions: content.clarification_questions.map((q) => ({ id: q.id, question: q.question, reason: q.reason })),
    questionnaire: content.questionnaire.map((s) => ({ id: s.id, section: s.section, questions: s.questions.map((q) => ({ id: q.id, question: q.question, purpose: q.purpose, answer_type: q.answer_type })) })),
  };
}

/**
 * Applies validated edits. Citations (the client's words) are kept for a
 * field only while its value is unchanged; an edited value is the lawyer's,
 * not the client's, so it loses the quotes and is marked confirmed unless the
 * reviewer chose another status.
 */
export function applyBriefEdits(content: IntakeContent, edits: z.output<typeof briefEditsSchema>, now: string, newId: () => string): IntakeContent {
  const fields = Object.fromEntries(
    Object.entries(content.fields).map(([key, field]) => {
      const edit = edits.fields[key as keyof typeof edits.fields];
      if (edit.value === field.value && edit.status === field.status) return [key, field];
      const valueChanged = edit.value !== field.value;
      const status = valueChanged && edit.status === field.status && edit.status !== "not_provided" ? "confirmed" : edit.status;
      return [key, { value: edit.value, status, reference_ids: valueChanged ? [] : field.reference_ids, note: null }];
    }),
  ) as IntakeContent["fields"];

  const partiesById = new Map(content.other_parties.map((p) => [p.id, p]));
  return {
    ...content,
    summary: { text: edits.summary, reference_ids: edits.summary === content.summary.text ? content.summary.reference_ids : [] },
    fields,
    other_parties: edits.other_parties.map((p) => {
      const existing = p.id ? partiesById.get(p.id) : undefined;
      const same = existing && existing.name === p.name && existing.role === p.role;
      return { id: existing?.id ?? newId(), name: p.name, role: p.role, status: same ? p.status : p.status === "stated" ? "confirmed" : p.status, reference_ids: same ? existing.reference_ids : [] };
    }),
    missing_information: edits.missing_information.map((m) => ({ id: m.id ?? newId(), text: m.text })),
    missing_documents: edits.missing_documents.map((d) => ({ id: d.id ?? newId(), document: d.document, reason: d.reason })),
    clarification_questions: edits.clarification_questions.map((q) => ({ id: q.id ?? newId(), question: q.question, reason: q.reason })),
    questionnaire: edits.questionnaire.map((s) => ({ id: s.id ?? newId(), section: s.section, questions: s.questions.map((q) => ({ id: q.id ?? newId(), question: q.question, purpose: q.purpose, answer_type: q.answer_type })) })),
    last_edited_at: now,
  };
}

export const finalizeInputSchema = z
  .object({
    matter_name: z.string().trim().min(1, "اسم الملف مطلوب.").max(200),
    matter_type: z.string().trim().max(100).optional().transform((v) => v || null),
  })
  .strict();

export type FinalizeInput = z.input<typeof finalizeInputSchema>;

export type PreparedMatter =
  | { ok: true; matter: { matter_name: string; client_name: string; matter_type: string | null; description: string; status: "active" } }
  | { ok: false; message: string };

/**
 * Builds the matter row from the reviewed brief. The client must be known;
 * nothing is filled in for fields the brief marks as not provided.
 */
export function prepareMatterFromBrief(content: IntakeContent, input: FinalizeInput): PreparedMatter {
  if (content.finalized) return { ok: false, message: "استُخدم هذا الملخص لإنشاء ملف من قبل." };
  const parsed = finalizeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "مدخلات غير صالحة." };
  const client = content.fields.client;
  if (client.status === "not_provided" || !client.value) return { ok: false, message: "حدّد العميل في الملخص قبل إنشاء الملف." };

  const outcome = content.fields.requested_outcome;
  const description = [
    content.summary.text ? `ملخص الاستقبال (منظَّم آليًا وراجعه المحامي): ${content.summary.text}` : null,
    `النتيجة المطلوبة: ${outcome.status === "not_provided" ? NOT_PROVIDED : outcome.value}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 5000);

  const matterType = parsed.data.matter_type ?? (content.fields.matter_type.status === "not_provided" ? null : content.fields.matter_type.value || null);
  const checked = matterCreateSchema.safeParse({ matter_name: parsed.data.matter_name, client_name: client.value, matter_type: matterType, description, status: "active" });
  if (!checked.success) return { ok: false, message: checked.error.issues[0]?.message ?? "بيانات الملف غير صالحة." };
  return {
    ok: true,
    matter: {
      matter_name: checked.data.matter_name,
      client_name: checked.data.client_name ?? client.value,
      matter_type: checked.data.matter_type,
      description: checked.data.description ?? description,
      status: "active",
    },
  };
}

/** Default matter name: client and first other party, when known. */
export function suggestMatterName(content: IntakeContent): string {
  const client = content.fields.client.status === "not_provided" ? "" : content.fields.client.value;
  const other = content.other_parties[0]?.name;
  return [client, other].filter(Boolean).join(" ضد ").slice(0, 200) || "ملف جديد";
}
