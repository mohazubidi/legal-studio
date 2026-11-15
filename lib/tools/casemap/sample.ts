import type { SourceReferenceRow } from "@/types/database";
import type { IndexedSource } from "@/lib/tools/shared/citations";
import type { SourceSnapshot } from "@/lib/tools/shared/sources";
import type { CaseMapOutput } from "./model-schema";
import { buildCaseMapRecord } from "./record";

/**
 * Illustrative, fictional CaseMap shown only where there is no database
 * (preview mode). It is built through the real record pipeline, so the
 * verification rules apply: one citation below is deliberately wrong and is
 * rejected, leaving that event unreferenced.
 */
const DOC_CONTRACT = "5a1d0c2e-0000-4000-8000-000000000001";
const DOC_LETTER = "5a1d0c2e-0000-4000-8000-000000000002";
const DOC_NOTES = "5a1d0c2e-0000-4000-8000-000000000003";
const DOC_AUDIO = "5a1d0c2e-0000-4000-8000-000000000004";

const sources: IndexedSource[] = [
  {
    sourceId: "S1",
    documentId: DOC_CONTRACT,
    fileName: "عقد توريد (مثال).pdf",
    segments: [
      { id: "p1", label: "صفحة 1", text: "أبرم هذا العقد في 1445/03/12هـ بين شركة الأفق للتجارة (المورد) ومؤسسة النخبة (المشتري)." },
      { id: "p2", label: "صفحة 2", text: "يلتزم المورد بتسليم البضاعة خلال ثلاثين يومًا من توقيع العقد. قيمة العقد 450,000 ريال." },
      { id: "p3", label: "صفحة 3", text: "في حال التأخر يستحق المشتري غرامة قدرها 1% عن كل أسبوع تأخير بحد أقصى 10%." },
    ],
  },
  {
    sourceId: "S2",
    documentId: DOC_LETTER,
    fileName: "خطاب المطالبة (مثال).pdf",
    segments: [
      { id: "p1", label: "صفحة 1", text: "بتاريخ 2023-11-20 نطالبكم بسداد غرامة التأخير، إذ تم التسليم بعد خمسة وأربعين يومًا من التاريخ المتفق عليه." },
      { id: "p2", label: "صفحة 2", text: "يبلغ إجمالي المطالبة 45,000 ريال وفق البند الخاص بالغرامات." },
    ],
  },
  {
    sourceId: "S3",
    documentId: DOC_NOTES,
    fileName: "ملاحظات الاجتماع (مثال).txt",
    segments: [
      { id: "s1", label: "فقرة 1", text: "أفاد ممثل المورد أن التأخير سببه تأخر المشتري في اعتماد المواصفات النهائية." },
      { id: "s2", label: "فقرة 2", text: "ذكر ممثل المورد أن البضاعة سُلّمت بعد ثلاثين يومًا من اعتماد المواصفات." },
    ],
  },
];

const snapshot: SourceSnapshot[] = [
  ...sources.map((s) => ({
    document_id: s.documentId,
    label: s.sourceId,
    file_name: s.fileName,
    source_kind: s.sourceId === "S3" ? "meeting_transcript" : "document",
    processing_status: "processed",
    processing_error: null,
    included: true,
  })),
  {
    document_id: DOC_AUDIO,
    label: "—",
    file_name: "تسجيل مكالمة (مثال).m4a",
    source_kind: "audio_recording",
    processing_status: "failed",
    processing_error: "التفريغ الصوتي غير متاح على هذا الخادم.",
    included: false,
  },
];

const cite = (source_id: string, segment_id: string, quote: string) => ({ source_id, segment_id, quote });

const output: CaseMapOutput = {
  parties: [
    { key: "P1", name: "شركة الأفق للتجارة", role: "المورد", citations: [cite("S1", "p1", "شركة الأفق للتجارة (المورد)")] },
    { key: "P2", name: "مؤسسة النخبة", role: "المشتري", citations: [cite("S1", "p1", "ومؤسسة النخبة (المشتري)")] },
  ],
  claims: [
    {
      key: "C1",
      title: "المطالبة بغرامة التأخير في التسليم",
      claimant_keys: ["P2"],
      respondent_keys: ["P1"],
      citations: [cite("S2", "p1", "نطالبكم بسداد غرامة التأخير")],
      positions: [
        { party_key: "P2", position: "التسليم تم بعد خمسة وأربعين يومًا من التاريخ المتفق عليه.", citations: [cite("S2", "p1", "تم التسليم بعد خمسة وأربعين يومًا من التاريخ المتفق عليه")] },
        { party_key: "P1", position: "التأخير سببه تأخر المشتري في اعتماد المواصفات.", citations: [cite("S3", "s1", "التأخير سببه تأخر المشتري في اعتماد المواصفات النهائية")] },
      ],
    },
  ],
  events: [
    {
      title: "إبرام عقد التوريد",
      description: "توقيع العقد بين المورد والمشتري.",
      date: { text: "1445/03/12هـ", calendar: "hijri", year: 1445, month: 3, day: 12 },
      party_keys: ["P1", "P2"],
      claim_keys: [],
      citations: [cite("S1", "p1", "أبرم هذا العقد في 1445/03/12هـ")],
    },
    {
      title: "خطاب المطالبة بغرامة التأخير",
      description: "المشتري يطالب المورد بسداد الغرامة.",
      date: { text: "2023-11-20", calendar: "gregorian", year: 2023, month: 11, day: 20 },
      party_keys: ["P2", "P1"],
      claim_keys: ["C1"],
      citations: [cite("S2", "p1", "بتاريخ 2023-11-20 نطالبكم بسداد غرامة التأخير")],
    },
    {
      title: "تسليم البضاعة",
      description: "تاريخ التسليم الفعلي غير مذكور في المصادر.",
      date: { text: "", calendar: "unknown", year: 0, month: 0, day: 0 },
      party_keys: ["P1"],
      claim_keys: ["C1"],
      // Deliberately wrong quote: rejected by verification, so the event is shown as unreferenced.
      citations: [cite("S2", "p1", "تم التسليم في 1445/05/01هـ")],
    },
  ],
  evidence: [
    {
      evidence_type: "contract",
      description: "بند مدة التسليم في العقد (ثلاثون يومًا من التوقيع).",
      supports: "يبدو أنه يحدد المهلة التعاقدية التي يُقاس عليها التأخير.",
      claim_keys: ["C1"],
      party_keys: ["P2"],
      citations: [cite("S1", "p2", "يلتزم المورد بتسليم البضاعة خلال ثلاثين يومًا من توقيع العقد")],
    },
    {
      evidence_type: "contract",
      description: "بند غرامة التأخير (1% أسبوعيًا بحد أقصى 10%).",
      supports: "يبدو أنه الأساس التعاقدي لاحتساب الغرامة المطالب بها.",
      claim_keys: ["C1"],
      party_keys: ["P2"],
      citations: [cite("S1", "p3", "غرامة قدرها 1% عن كل أسبوع تأخير بحد أقصى 10%")],
    },
    {
      evidence_type: "statement",
      description: "إفادة ممثل المورد عن سبب التأخير.",
      supports: "يبدو أنه يدعم دفع المورد بأن التأخير يعود إلى المشتري.",
      claim_keys: ["C1"],
      party_keys: ["P1"],
      citations: [cite("S3", "s1", "أفاد ممثل المورد أن التأخير سببه تأخر المشتري")],
    },
  ],
  contradictions: [
    {
      kind: "date",
      topic: "نقطة بداية احتساب مدة التسليم",
      statements: [
        { text: "خطاب المطالبة يحسب التأخير من التاريخ المتفق عليه في العقد.", citations: [cite("S2", "p1", "خمسة وأربعين يومًا من التاريخ المتفق عليه")] },
        { text: "إفادة المورد تحسب المدة من اعتماد المواصفات.", citations: [cite("S3", "s2", "سُلّمت بعد ثلاثين يومًا من اعتماد المواصفات")] },
      ],
      interpretation: "يختلف الطرفان في تاريخ بدء المهلة، مما ينعكس على وجود التأخير ومدته. يتطلب ذلك مراجعة مهنية.",
    },
  ],
  missing_information: [
    { kind: "missing", text: "تاريخ اعتماد المواصفات النهائية غير مذكور في المصادر.", claim_keys: ["C1"], citations: [] },
    { kind: "unclear", text: "طريقة احتساب مبلغ المطالبة (45,000 ريال) غير موضحة مقارنة ببند الغرامة.", claim_keys: ["C1"], citations: [cite("S2", "p2", "يبلغ إجمالي المطالبة 45,000 ريال")] },
  ],
};

let counter = 0;
const sampleId = () => `5a1d0c2e-0000-4000-9000-${String(++counter).padStart(12, "0")}`;

const record = buildCaseMapRecord({ output, sources, snapshot, model: "مثال توضيحي", now: "2026-01-01T00:00:00.000Z", newId: sampleId });

export const SAMPLE_CASEMAP = record.content;
export const SAMPLE_CASEMAP_REFERENCES: SourceReferenceRow[] = record.references.map((ref) => ({
  ...ref,
  output_id: "sample",
  created_at: "2026-01-01T00:00:00.000Z",
}));
