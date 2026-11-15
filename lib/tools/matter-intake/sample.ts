import { segmentParagraphs, segmentQuestionAnswers } from "@/lib/documents/extraction";
import type { IndexedSource } from "@/lib/tools/shared/citations";
import type { SourceSnapshot } from "@/lib/tools/shared/sources";
import type { SourceReferenceRow } from "@/types/database";
import { formatIntakeAnswers, intakeFormSchema } from "./form";
import type { IntakeBriefOutput } from "./model-schema";
import { buildIntakeRecord } from "./record";

/**
 * Fictional intake shown only in preview mode (no database), and used as a
 * test fixture. Built through the real record pipeline; the model output is
 * hand-written with four planted problems:
 *  - a sentence of legal advice in the summary (removed);
 *  - "requested outcome" marked stated without a quote (becomes inferred);
 *  - an amount that is not in the client's words (removed);
 *  - a voice recording that could not be transcribed (reported, not used).
 */
export const SAMPLE_FORM = intakeFormSchema.parse({
  client_name: "مؤسسة الريادة للمقاولات",
  client_type: "company",
  other_parties: "شركة البنيان للتوريد (المورّد)",
  relationship: "عقد توريد مواد بناء",
  matter_type: "",
  description: "تعاقدنا مع شركة البنيان على توريد حديد تسليح لمشروعنا، ودفعنا دفعة مقدمة، لكن التوريد تأخر ووصل جزء من الكمية فقط وبمواصفات مختلفة.",
  key_dates: "وقّعنا العقد في 2024-03-10، وكان موعد التوريد 2024-04-10.",
  amounts: "الدفعة المقدمة 200,000 ريال.",
  requested_outcome: "",
  urgency: "",
  documents_available: "العقد، وإيصال التحويل.",
});

const IDS = {
  form: "e1e1a0a0-0000-4000-8000-000000000001",
  statement: "e1e1a0a0-0000-4000-8000-000000000002",
  audio: "e1e1a0a0-0000-4000-8000-000000000003",
};

const STATEMENT = "المشروع متوقف بسبب نقص الحديد. وصلنا نحو نصف الكمية فقط في نهاية أبريل، والمورد يقول إن التأخير بسبب الشحن. نريد استرداد المبلغ أو إكمال التوريد بسرعة.";

export const SAMPLE_INTAKE_SOURCES: IndexedSource[] = [
  { sourceId: "S1", documentId: IDS.form, fileName: "إجابات نموذج الاستقبال.txt", segments: segmentQuestionAnswers(formatIntakeAnswers(SAMPLE_FORM)) },
  { sourceId: "S2", documentId: IDS.statement, fileName: "رواية العميل.txt", segments: segmentParagraphs(STATEMENT) },
];

const snapshot: SourceSnapshot[] = [
  { document_id: IDS.form, label: "S1", file_name: "إجابات نموذج الاستقبال.txt", source_kind: "intake_form", processing_status: "processed", processing_error: null, included: true },
  { document_id: IDS.statement, label: "S2", file_name: "رواية العميل.txt", source_kind: "client_statement", processing_status: "processed", processing_error: null, included: true },
  {
    document_id: IDS.audio,
    label: "—",
    file_name: "مكالمة العميل (مثال).m4a",
    source_kind: "audio_recording",
    processing_status: "failed",
    processing_error: "التفريغ الصوتي غير متاح: لم تُضبط خدمة التفريغ على الخادم.",
    included: false,
  },
];

/** Finds the segment id containing a quote, so the sample's citations point at real segments. */
function cite(sourceId: "S1" | "S2", quote: string) {
  const source = SAMPLE_INTAKE_SOURCES.find((s) => s.sourceId === sourceId)!;
  const segment = source.segments.find((s) => s.text.includes(quote));
  return segment ? [{ source_id: sourceId, segment_id: segment.id, quote }] : [];
}
const noDate = { text: "", calendar: "unknown" as const, year: 0, month: 0, day: 0 };

const output: IntakeBriefOutput = {
  summary: {
    text: "تفيد مؤسسة الريادة بأنها تعاقدت مع شركة البنيان على توريد حديد تسليح ودفعت دفعة مقدمة، وأن التوريد تأخر ووصل جزئيًا وبمواصفات مختلفة. ننصح العميل برفع دعوى فورًا.",
    citations: cite("S1", "ووصل جزء من الكمية فقط وبمواصفات مختلفة"),
  },
  client: { value: "مؤسسة الريادة للمقاولات", status: "stated", citations: cite("S1", "مؤسسة الريادة للمقاولات") },
  relationship: { value: "عقد توريد حديد تسليح بين العميل (مشترٍ) وشركة البنيان (مورّد).", status: "stated", citations: cite("S1", "عقد توريد مواد بناء") },
  matter_type: { value: "نزاع تجاري حول تنفيذ عقد توريد", status: "inferred", citations: [] },
  requested_outcome: { value: "استرداد الدفعة المقدمة أو إكمال التوريد.", status: "stated", citations: [] },
  other_parties: [{ name: "شركة البنيان للتوريد", role: "المورّد", status: "stated", citations: cite("S1", "شركة البنيان للتوريد (المورّد)") }],
  key_events: [
    { description: "توقيع عقد التوريد", date: { text: "2024-03-10", calendar: "gregorian", year: 2024, month: 3, day: 10 }, status: "stated", citations: cite("S1", "وقّعنا العقد في 2024-03-10") },
    { description: "الموعد المتفق عليه للتوريد", date: { text: "2024-04-10", calendar: "gregorian", year: 2024, month: 4, day: 10 }, status: "stated", citations: cite("S1", "وكان موعد التوريد 2024-04-10") },
    { description: "وصول نحو نصف الكمية", date: noDate, status: "stated", citations: cite("S2", "وصلنا نحو نصف الكمية فقط في نهاية أبريل") },
  ],
  dates: [
    { label: "توقيع العقد", date: { text: "2024-03-10", calendar: "gregorian", year: 2024, month: 3, day: 10 }, citations: cite("S1", "وقّعنا العقد في 2024-03-10") },
  ],
  amounts: [
    { label: "الدفعة المقدمة", amount_text: "200,000", currency: "ريال", citations: cite("S1", "الدفعة المقدمة 200,000 ريال") },
    // Planted: not in the client's words.
    { label: "قيمة العقد الإجمالية", amount_text: "800,000", currency: "ريال", citations: cite("S1", "الدفعة المقدمة 200,000 ريال") },
  ],
  documents_mentioned: [
    { description: "عقد التوريد", provided: false, citations: cite("S1", "العقد، وإيصال التحويل") },
    { description: "إيصال تحويل الدفعة المقدمة", provided: false, citations: cite("S1", "العقد، وإيصال التحويل") },
  ],
  missing_information: [
    { text: "قيمة العقد الإجمالية والكمية المتعاقد عليها." },
    { text: "تفاصيل الاختلاف في المواصفات وما إذا وُثّق عند الاستلام." },
  ],
  missing_documents: [
    { document: "نسخة موقعة من العقد", reason: "لتحديد الالتزامات ومواعيد التوريد كما وردت." },
    { document: "محاضر الاستلام أو إشعارات التسليم", reason: "لتوثيق الكمية المسلّمة وتاريخها." },
    { document: "المراسلات مع المورّد", reason: "لمعرفة ما أُبلغ به العميل عن سبب التأخير." },
  ],
  contradictions: [
    {
      topic: "طبيعة الإخلال",
      statements: [
        { text: "نموذج الاستقبال يذكر وصول جزء من الكمية بمواصفات مختلفة.", citations: cite("S1", "ووصل جزء من الكمية فقط وبمواصفات مختلفة") },
        { text: "رواية العميل تذكر نقص الكمية والتأخير دون ذكر المواصفات.", citations: cite("S2", "وصلنا نحو نصف الكمية فقط في نهاية أبريل") },
      ],
    },
  ],
  clarification_questions: [
    { question: "ما الكمية المتعاقد عليها، وما الكمية التي وصلت فعلًا؟", reason: "الأرقام المذكورة تقريبية." },
    { question: "هل وُثّق اختلاف المواصفات كتابيًا عند الاستلام؟", reason: "ورد الاختلاف في النموذج دون تفاصيل." },
  ],
  questionnaire: [
    {
      section: "العقد والالتزامات",
      questions: [
        { question: "ما القيمة الإجمالية للعقد؟", purpose: "تحديد نسبة الدفعة المقدمة من القيمة.", answer_type: "amount" },
        { question: "هل يتضمن العقد شرطًا بشأن التأخير في التوريد؟", purpose: "التعرف على ما اتفق عليه الطرفان.", answer_type: "yes_no" },
        { question: "يرجى إرفاق نسخة العقد الموقعة.", purpose: "مراجعة النص الكامل.", answer_type: "document" },
      ],
    },
    {
      section: "التسليم والمراسلات",
      questions: [
        { question: "ما تاريخ وصول الشحنة الجزئية بالتحديد؟", purpose: "تحديد تسلسل الأحداث.", answer_type: "date" },
        { question: "هل أُبلغ المورّد كتابيًا بالنقص أو باختلاف المواصفات؟", purpose: "معرفة ما دار بين الطرفين.", answer_type: "yes_no" },
      ],
    },
  ],
};

let counter = 0;
const sampleId = () => `e1e1a0a0-0000-4000-9000-${String(++counter).padStart(12, "0")}`;
const record = buildIntakeRecord({ output, sources: SAMPLE_INTAKE_SOURCES, snapshot, model: "مثال توضيحي", now: "2026-01-01T00:00:00.000Z", newId: sampleId });

export const SAMPLE_INTAKE = record.content;
export const SAMPLE_INTAKE_REFERENCES: SourceReferenceRow[] = record.references.map((ref) => ({ ...ref, output_id: "sample", created_at: "2026-01-01T00:00:00.000Z" }));
