import type { IndexedSource } from "@/lib/tools/shared/citations";
import type { SourceSnapshot } from "@/lib/tools/shared/sources";
import type { SourceReferenceRow } from "@/types/database";
import type { ContractOutput } from "./model-schema";
import { buildContractRecord } from "./record";

/**
 * Fictional contract shown only in preview mode (no database). Built through
 * the real record pipeline, so verification applies. Three model mistakes are
 * planted to show it working:
 *  - a payment amount that is not in the contract (removed);
 *  - a clause number that does not appear in the cited text (removed);
 *  - a review note calling a clause "غير قانوني" (replaced with neutral wording).
 */
const DOC = "c0c0a5a5-0000-4000-8000-000000000001";

export const SAMPLE_CONTRACT_SOURCE: IndexedSource = {
  sourceId: "S1",
  documentId: DOC,
  fileName: "عقد تقديم خدمات صيانة (مثال).pdf",
  segments: [
    {
      id: "p1",
      label: "صفحة 1",
      text: "البند الأول: الأطراف. أبرم هذا العقد بين شركة المدار للتقنية (مقدم الخدمة) وشركة الرواسي القابضة (العميل). البند الثاني: يسري هذا العقد اعتبارًا من 1446/01/01هـ ولمدة سنة واحدة.",
    },
    {
      id: "p2",
      label: "صفحة 2",
      text: "البند الثالث: يتجدد العقد تلقائيًا لمدد مماثلة ما لم يخطر أحد الطرفين الآخر برغبته في عدم التجديد قبل ثلاثين يومًا من انتهاء المدة. البند الرابع: يلتزم مقدم الخدمة بالاستجابة لطلبات الصيانة خلال 48 ساعة من الإبلاغ.",
    },
    {
      id: "p3",
      label: "صفحة 3",
      text: "البند الخامس: يدفع العميل مقابلًا سنويًا قدره 120,000 ريال سعودي، على أربع دفعات ربع سنوية تستحق في بداية كل ربع. البند السادس: لا يتحمل مقدم الخدمة أي مسؤولية عن الأضرار غير المباشرة أيًا كان سببها.",
    },
    {
      id: "p4",
      label: "صفحة 4",
      text: "البند السابع: يلتزم الطرفان بالمحافظة على سرية المعلومات المتبادلة طوال مدة العقد. البند الثامن: يخضع هذا العقد للأنظمة المعمول بها في المملكة العربية السعودية، وتختص المحاكم التجارية في مدينة الرياض بنظر أي نزاع ينشأ عنه.",
    },
  ],
};

const snapshot: SourceSnapshot[] = [
  {
    document_id: DOC,
    label: "S1",
    file_name: SAMPLE_CONTRACT_SOURCE.fileName,
    source_kind: "document",
    processing_status: "processed",
    processing_error: null,
    included: true,
  },
];

const cite = (segment_id: string, quote: string) => [{ source_id: "S1", segment_id, quote }];
const noDate = { text: "", calendar: "unknown" as const, year: 0, month: 0, day: 0 };

const output: ContractOutput = {
  parties: [
    { key: "P1", name: "شركة المدار للتقنية", role: "مقدم الخدمة", citations: cite("p1", "شركة المدار للتقنية (مقدم الخدمة)") },
    { key: "P2", name: "شركة الرواسي القابضة", role: "العميل", citations: cite("p1", "شركة الرواسي القابضة (العميل)") },
  ],
  terms: {
    effective_date: {
      status: "stated",
      summary: "يسري العقد من بداية السنة الهجرية 1446.",
      clause_ref: "البند الثاني",
      citations: cite("p1", "يسري هذا العقد اعتبارًا من 1446/01/01هـ"),
      date: { text: "1446/01/01هـ", calendar: "hijri", year: 1446, month: 1, day: 1 },
    },
    duration: { status: "stated", summary: "سنة واحدة.", clause_ref: "البند الثاني", citations: cite("p1", "ولمدة سنة واحدة") },
    renewal: {
      status: "stated",
      summary: "تجديد تلقائي لمدد مماثلة ما لم يُخطر أحد الطرفين بعدم التجديد.",
      clause_ref: "البند الثالث",
      citations: cite("p2", "يتجدد العقد تلقائيًا لمدد مماثلة"),
    },
    termination: { status: "not_stated", summary: "", clause_ref: "", citations: [] },
    confidentiality: {
      status: "stated",
      summary: "التزام متبادل بالسرية طوال مدة العقد.",
      clause_ref: "البند السابع",
      citations: cite("p4", "يلتزم الطرفان بالمحافظة على سرية المعلومات المتبادلة طوال مدة العقد"),
    },
    liability: {
      status: "stated",
      summary: "استبعاد مسؤولية مقدم الخدمة عن الأضرار غير المباشرة.",
      clause_ref: "البند السادس",
      citations: cite("p3", "لا يتحمل مقدم الخدمة أي مسؤولية عن الأضرار غير المباشرة"),
    },
    dispute_resolution: {
      status: "stated",
      summary: "اختصاص المحاكم التجارية في الرياض.",
      clause_ref: "البند الثامن",
      citations: cite("p4", "وتختص المحاكم التجارية في مدينة الرياض بنظر أي نزاع ينشأ عنه"),
    },
    governing_law: {
      status: "stated",
      summary: "الأنظمة المعمول بها في المملكة العربية السعودية.",
      clause_ref: "البند الثامن",
      citations: cite("p4", "يخضع هذا العقد للأنظمة المعمول بها في المملكة العربية السعودية"),
    },
  },
  notice_periods: [
    { purpose: "الإخطار بعدم التجديد", period_text: "ثلاثين يومًا", clause_ref: "البند الثالث", citations: cite("p2", "قبل ثلاثين يومًا من انتهاء المدة") },
  ],
  payments: [
    {
      description: "المقابل السنوي للخدمات، على أربع دفعات ربع سنوية.",
      amount_text: "120,000",
      currency: "ريال سعودي",
      due_text: "في بداية كل ربع",
      due_date: noDate,
      clause_ref: "البند الخامس",
      citations: cite("p3", "يدفع العميل مقابلًا سنويًا قدره 120,000 ريال سعودي"),
    },
    {
      // Planted mistake: this amount is not in the contract and must be removed.
      description: "قيمة كل دفعة ربع سنوية.",
      amount_text: "30,000",
      currency: "ريال سعودي",
      due_text: "",
      due_date: noDate,
      clause_ref: "البند الخامس",
      citations: cite("p3", "على أربع دفعات ربع سنوية تستحق في بداية كل ربع"),
    },
  ],
  obligations: [
    {
      description: "الاستجابة لطلبات الصيانة.",
      responsible_party_keys: ["P1"],
      deadline_text: "خلال 48 ساعة من الإبلاغ",
      deadline_date: noDate,
      clause_ref: "البند الرابع",
      citations: cite("p2", "يلتزم مقدم الخدمة بالاستجابة لطلبات الصيانة خلال 48 ساعة من الإبلاغ"),
    },
    {
      description: "سداد المقابل السنوي على دفعات ربع سنوية.",
      responsible_party_keys: ["P2"],
      deadline_text: "في بداية كل ربع",
      deadline_date: noDate,
      clause_ref: "البند الخامس",
      citations: cite("p3", "تستحق في بداية كل ربع"),
    },
    {
      description: "المحافظة على سرية المعلومات المتبادلة.",
      responsible_party_keys: ["P1", "P2"],
      deadline_text: "طوال مدة العقد",
      deadline_date: noDate,
      // Planted mistake: "البند 12" does not appear in the cited text and must be removed.
      clause_ref: "البند 12",
      citations: cite("p4", "يلتزم الطرفان بالمحافظة على سرية المعلومات المتبادلة"),
    },
  ],
  review_items: [
    {
      topic: "تجديد تلقائي مع مهلة إخطار",
      clause_ref: "البند الثالث",
      note: "قد يمتد العقد دون إجراء صريح إذا فاتت مهلة الثلاثين يومًا؛ يستحسن متابعة تاريخ الإخطار.",
      label: "contractual_effect",
      citations: cite("p2", "يتجدد العقد تلقائيًا لمدد مماثلة"),
    },
    {
      topic: "استبعاد المسؤولية عن الأضرار غير المباشرة",
      clause_ref: "البند السادس",
      // Planted mistake: a definitive legal conclusion, which must be replaced.
      note: "هذا الشرط غير قانوني ويمثل مخاطر عالية على العميل.",
      label: "worth_review",
      citations: cite("p3", "لا يتحمل مقدم الخدمة أي مسؤولية عن الأضرار غير المباشرة"),
    },
  ],
  missing_information: [
    { kind: "missing", text: "لا ينص العقد على حالات الإنهاء المبكر أو آثاره.", citations: [] },
    { kind: "unclear", text: "لم يحدد العقد مستوى الخدمة أو آلية قياس الاستجابة بعد مهلة 48 ساعة.", citations: cite("p2", "خلال 48 ساعة من الإبلاغ") },
  ],
};

let counter = 0;
const sampleId = () => `c0c0a5a5-0000-4000-9000-${String(++counter).padStart(12, "0")}`;

const record = buildContractRecord({ output, source: SAMPLE_CONTRACT_SOURCE, snapshot, model: "مثال توضيحي", now: "2026-01-01T00:00:00.000Z", newId: sampleId });

export const SAMPLE_CONTRACT = record.content;
export const SAMPLE_CONTRACT_REFERENCES: SourceReferenceRow[] = record.references.map((ref) => ({ ...ref, output_id: "sample", created_at: "2026-01-01T00:00:00.000Z" }));
