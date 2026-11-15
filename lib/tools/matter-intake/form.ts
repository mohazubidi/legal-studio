import { z } from "zod";

/**
 * The guided intake form. Validated on the server; answers are stored
 * verbatim as an `intake_form` source so the client's wording is preserved
 * and every brief field can cite it.
 */
function optional(max: number) {
  return z
    .string()
    .trim()
    .max(max, `النص أطول من الحد المسموح (${max} حرف).`)
    .optional()
    .transform((value) => value ?? "");
}

export const CLIENT_TYPES = ["individual", "company", "government", "other"] as const;

export const intakeFormSchema = z
  .object({
    client_name: z.string().trim().min(2, "اسم العميل مطلوب.").max(200, "اسم العميل أطول من المسموح."),
    client_type: z.enum(CLIENT_TYPES, { errorMap: () => ({ message: "صفة العميل غير صالحة." }) }),
    other_parties: optional(2000),
    relationship: optional(2000),
    matter_type: optional(100),
    description: z.string().trim().min(20, "صف المسألة في 20 حرفًا على الأقل.").max(10_000, "الوصف أطول من الحد المسموح."),
    key_dates: optional(2000),
    amounts: optional(2000),
    requested_outcome: optional(3000),
    urgency: optional(1000),
    documents_available: optional(2000),
  })
  .strict();

export type IntakeFormInput = z.input<typeof intakeFormSchema>;
export type IntakeForm = z.output<typeof intakeFormSchema>;

export const CLIENT_TYPE_LABELS: Record<(typeof CLIENT_TYPES)[number], string> = {
  individual: "فرد",
  company: "شركة أو مؤسسة",
  government: "جهة حكومية",
  other: "أخرى",
};

/** Question wording, in form order. Also used as the stored labels. */
export const INTAKE_QUESTIONS: { key: keyof IntakeForm; label: string; hint?: string; multiline?: boolean }[] = [
  { key: "client_name", label: "اسم العميل" },
  { key: "client_type", label: "صفة العميل" },
  { key: "other_parties", label: "الأطراف الأخرى", hint: "الأسماء وصفة كل طرف كما يذكرها العميل", multiline: true },
  { key: "relationship", label: "العلاقة بين الأطراف", hint: "عقد، عمل، شراكة، جوار…", multiline: true },
  { key: "matter_type", label: "نوع المسألة كما يصفها العميل" },
  { key: "description", label: "ماذا حدث؟ (بكلمات العميل)", multiline: true },
  { key: "key_dates", label: "التواريخ المهمة", multiline: true },
  { key: "amounts", label: "المبالغ المرتبطة", multiline: true },
  { key: "requested_outcome", label: "ما الذي يريده العميل؟", multiline: true },
  { key: "urgency", label: "مواعيد أو أمور عاجلة" },
  { key: "documents_available", label: "المستندات المتوفرة لدى العميل", multiline: true },
];

/**
 * Formats answers as question/answer paragraphs. Unanswered questions are
 * recorded explicitly, so the brief can report them as not provided rather
 * than guess.
 */
export function formatIntakeAnswers(form: IntakeForm): string {
  return INTAKE_QUESTIONS.map(({ key, label }) => {
    const raw = form[key];
    const value = key === "client_type" ? CLIENT_TYPE_LABELS[form.client_type] : String(raw ?? "").trim();
    return `السؤال: ${label}\nالإجابة: ${value || "لم تُقدَّم إجابة."}`;
  }).join("\n\n");
}
