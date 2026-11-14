/**
 * Sample data for the application shell. Clearly fictional.
 * Replace these accessors with Supabase queries when persistence is implemented;
 * the page components only depend on the function signatures below.
 */
import type { LegalDocument, Matter, Output, ToolResult } from "@/types/legal";

export const MATTERS: readonly Matter[] = [
  {
    id: "m-1001",
    reference: "LS-2026-014",
    title: "نزاع توريد معدات طبية",
    client: "شركة الأفق للتجارة (نموذج)",
    practiceArea: "تجاري",
    status: "active",
    updatedAt: "2026-11-12T09:30:00Z",
  },
  {
    id: "m-1002",
    reference: "LS-2026-015",
    title: "مراجعة عقد امتياز تجاري",
    client: "مؤسسة الريادة (نموذج)",
    practiceArea: "عقود",
    status: "active",
    updatedAt: "2026-11-10T13:05:00Z",
  },
  {
    id: "m-1003",
    reference: "LS-2026-009",
    title: "مطالبة عمالية بمستحقات نهاية الخدمة",
    client: "موكل فرد (نموذج)",
    practiceArea: "عمالي",
    status: "on_hold",
    updatedAt: "2026-10-28T08:00:00Z",
  },
  {
    id: "m-1004",
    reference: "LS-2026-003",
    title: "تقييم أثر تعديلات نظام الشركات",
    client: "شركة المدار القابضة (نموذج)",
    practiceArea: "امتثال",
    status: "closed",
    updatedAt: "2026-09-14T11:20:00Z",
  },
];

export const DOCUMENTS: readonly LegalDocument[] = [
  {
    id: "d-2001",
    name: "عقد توريد — النسخة الموقعة.pdf",
    matterId: "m-1001",
    kind: "عقد",
    mimeType: "application/pdf",
    sizeBytes: 482_000,
    uploadedAt: "2026-11-11T10:00:00Z",
    status: "reviewed",
    pages: [
      {
        number: 1,
        paragraphs: [
          { anchor: "p1-1", text: "إنه في يوم الأحد الموافق ١٤٤٧/٠٣/١٢هـ، تم الاتفاق بين كل من: شركة الأفق للتجارة (الطرف الأول)، وشركة الإمداد الطبي (الطرف الثاني)، على ما يلي." },
          { anchor: "p1-2", text: "المادة الأولى: يلتزم الطرف الثاني بتوريد المعدات الطبية الموضحة في الملحق رقم (١) وفق المواصفات المتفق عليها." },
          { anchor: "p1-3", text: "المادة الثانية: يتم التسليم خلال مدة لا تتجاوز ستين يومًا من تاريخ توقيع هذا العقد، في مستودعات الطرف الأول بمدينة الرياض." },
        ],
      },
      {
        number: 2,
        paragraphs: [
          { anchor: "p2-1", text: "المادة الخامسة: في حال تأخر الطرف الثاني عن التسليم، يلتزم بدفع غرامة تأخير قدرها (١٪) من قيمة العقد عن كل أسبوع تأخير، بحد أقصى (١٠٪)." },
          { anchor: "p2-2", text: "المادة السابعة: يخضع هذا العقد للأنظمة المعمول بها في المملكة العربية السعودية." },
        ],
      },
    ],
  },
  {
    id: "d-2002",
    name: "مراسلات المطالبة بالتسليم.docx",
    matterId: "m-1001",
    kind: "مراسلات",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: 96_000,
    uploadedAt: "2026-11-11T10:05:00Z",
    status: "processing",
    pages: [
      {
        number: 1,
        paragraphs: [
          { anchor: "p1-1", text: "نود إفادتكم بأن الشحنة لم تصل حتى تاريخه، ونطالبكم بالتسليم وفق المادة الثانية من العقد." },
        ],
      },
    ],
  },
  {
    id: "d-2003",
    name: "مسودة عقد الامتياز.docx",
    matterId: "m-1002",
    kind: "عقد",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sizeBytes: 212_000,
    uploadedAt: "2026-11-09T15:40:00Z",
    status: "failed",
    pages: [
      { number: 1, paragraphs: [{ anchor: "p1-1", text: "تعذّر استخراج النص من هذا الملف في النسخة التجريبية." }] },
    ],
  },
];

const SAMPLE_MEMO_RESULT: ToolResult = {
  toolId: "legal-memo",
  title: "مذكرة أولية: التأخر في توريد المعدات الطبية",
  generatedAt: "2026-11-12T09:30:00Z",
  status: "in_review",
  isSample: true,
  sections: [
    {
      id: "facts",
      title: "الوقائع الثابتة من المستندات",
      items: [
        {
          id: "f1",
          type: "source",
          text: "التزم المورد بالتسليم خلال ستين يومًا من تاريخ توقيع العقد في مستودعات الرياض.",
          citations: [
            {
              documentId: "d-2001",
              documentName: "عقد توريد — النسخة الموقعة.pdf",
              page: 1,
              anchor: "p1-3",
              excerpt: "يتم التسليم خلال مدة لا تتجاوز ستين يومًا من تاريخ توقيع هذا العقد",
            },
          ],
        },
        {
          id: "f2",
          type: "source",
          text: "ينص العقد على غرامة تأخير بنسبة ١٪ أسبوعيًا بحد أقصى ١٠٪ من قيمة العقد.",
          citations: [
            {
              documentId: "d-2001",
              documentName: "عقد توريد — النسخة الموقعة.pdf",
              page: 2,
              anchor: "p2-1",
              excerpt: "غرامة تأخير قدرها (١٪) من قيمة العقد عن كل أسبوع تأخير، بحد أقصى (١٠٪)",
            },
          ],
        },
      ],
    },
    {
      id: "analysis",
      title: "التحليل",
      items: [
        {
          id: "a1",
          type: "analysis",
          text: "يبدو أن شرط الغرامة يمثل تعويضًا اتفاقيًا، وقد يكون الأساس الأقرب للمطالبة بدلًا من التعويض العام.",
        },
        { id: "m1", type: "missing", text: "تاريخ استلام الشحنة الفعلي (إن وُجد) غير وارد في المستندات المرفقة." },
        { id: "m2", type: "missing", text: "قيمة العقد الإجمالية غير مذكورة، ولا يمكن احتساب مبلغ الغرامة دونها." },
        {
          id: "v1",
          type: "verify",
          text: "يجب التحقق من النص النظامي المنطبق على الشرط الجزائي ومدى سلطة الجهة القضائية في تعديله قبل الاعتماد عليه.",
        },
      ],
    },
  ],
};

export const OUTPUTS: readonly Output[] = [
  {
    id: "o-3001",
    title: SAMPLE_MEMO_RESULT.title,
    toolId: "legal-memo",
    matterId: "m-1001",
    status: "in_review",
    createdAt: "2026-11-12T09:30:00Z",
    result: SAMPLE_MEMO_RESULT,
  },
  {
    id: "o-3002",
    title: "قائمة بنود عقد الامتياز محل المراجعة",
    toolId: "contract-compass",
    matterId: "m-1002",
    status: "draft",
    createdAt: "2026-11-10T13:05:00Z",
    result: { ...SAMPLE_MEMO_RESULT, toolId: "contract-compass", title: "قائمة بنود عقد الامتياز محل المراجعة", status: "draft" },
  },
  {
    id: "o-3003",
    title: "ملخص أثر تعديلات نظام الشركات",
    toolId: "regdelta",
    matterId: "m-1004",
    status: "reviewed",
    createdAt: "2026-09-14T11:20:00Z",
    result: { ...SAMPLE_MEMO_RESULT, toolId: "regdelta", title: "ملخص أثر تعديلات نظام الشركات", status: "reviewed" },
  },
];

export function getMatter(id: string): Matter | undefined {
  return MATTERS.find((matter) => matter.id === id);
}

export function getDocument(id: string): LegalDocument | undefined {
  return DOCUMENTS.find((doc) => doc.id === id);
}

export function getOutput(id: string): Output | undefined {
  return OUTPUTS.find((output) => output.id === id);
}

/** Illustrative result rendered in each tool workspace until the AI workflow exists. */
export function getSampleResult(toolId: ToolResult["toolId"]): ToolResult {
  return { ...SAMPLE_MEMO_RESULT, toolId, status: "draft" };
}
