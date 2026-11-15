import type { IndexedSource } from "@/lib/tools/shared/citations";
import type { SourceSnapshot } from "@/lib/tools/shared/sources";
import type { SourceReferenceRow } from "@/types/database";
import { alignProvisions } from "./compare";
import type { RegDeltaOutput } from "./model-schema";
import { splitProvisions } from "./provisions";
import { buildRegDeltaRecord, planChanges } from "./record";

/**
 * Two fictional versions of a regulation, shown only in preview mode (no
 * database), and used as test fixtures. The comparison runs through the real
 * pipeline. The model output below is hand-written and includes one sentence
 * claiming the new version is in force, which the guard removes.
 */
export const SAMPLE_PREVIOUS: IndexedSource = {
  sourceId: "S1",
  documentId: "d0d0e1e1-0000-4000-8000-000000000001",
  fileName: "لائحة الامتثال — النسخة السابقة (مثال).pdf",
  segments: [
    {
      id: "p1",
      label: "صفحة 1",
      text: "تصدر هذه اللائحة تنفيذًا لأحكام النظام.\nالمادة الأولى: التعريفات\nيقصد بالمنشأة كل شركة مرخصة.\nالمادة الثانية\nتلتزم المنشأة بتقديم التقرير السنوي خلال ثلاثين يومًا من نهاية السنة المالية، أي 30 يومًا.",
    },
    {
      id: "p2",
      label: "صفحة 2",
      text: "المادة الثالثة\nيعاقب من يخالف أحكام هذه اللائحة بغرامة لا تزيد على 50,000 ريال.\nالمادة الرابعة\nتتولى الإدارة القانونية مراجعة العقود قبل توقيعها والتأكد من اكتمال المستندات المطلوبة.\nالمادة الخامسة\nتنشر هذه اللائحة في الجريدة الرسمية ويعمل بها من تاريخ نشرها.",
    },
  ],
};

export const SAMPLE_NEXT: IndexedSource = {
  sourceId: "S2",
  documentId: "d0d0e1e1-0000-4000-8000-000000000002",
  fileName: "لائحة الامتثال — النسخة الجديدة (مثال).pdf",
  segments: [
    {
      id: "p1",
      label: "صفحة 1",
      text: "تصدر هذه اللائحة تنفيذًا لأحكام النظام.\nالمادة الأولى: التعريفات\nيقصد بالمنشأة كل شركة أو مؤسسة مرخصة.\nالمادة الثانية\nتلتزم المنشأة بتقديم التقرير السنوي خلال خمسة عشر يومًا من نهاية السنة المالية، أي 15 يومًا.",
    },
    {
      id: "p2",
      label: "صفحة 2",
      text: "المادة الثالثة\nيعاقب من يخالف أحكام هذه اللائحة بغرامة لا تزيد على 100,000 ريال.\nالمادة الرابعة\nتلتزم المنشأة بتعيين مسؤول امتثال يتولى الرفع للهيئة بأي مخالفة خلال خمسة أيام.\nالمادة الخامسة\nتتولى الإدارة القانونية مراجعة العقود قبل توقيعها والتأكد من اكتمال المستندات المطلوبة.",
    },
    {
      id: "p3",
      label: "صفحة 3",
      text: "المادة السادسة\nتنشر هذه اللائحة في الجريدة الرسمية ويعمل بها بعد تسعين يومًا من تاريخ نشرها.",
    },
  ],
};


const snapshot: SourceSnapshot[] = [SAMPLE_PREVIOUS, SAMPLE_NEXT].map((s) => ({
  document_id: s.documentId,
  label: s.sourceId,
  file_name: s.fileName,
  source_kind: "document",
  processing_status: "processed",
  processing_error: null,
  included: true,
}));

const previous = splitProvisions(SAMPLE_PREVIOUS, "A");
const next = splitProvisions(SAMPLE_NEXT, "B");
const { changes, unchanged } = planChanges(alignProvisions(previous.provisions, next.provisions));
const id = (label: string) => changes.find((c) => c.pair.b?.label === label)?.id ?? "";

const ai: RegDeltaOutput = {
  changes: [
    { change_id: id("المادة الأولى"), ai_types: ["scope"], summary: "وُسّع تعريف المنشأة ليشمل المؤسسات إلى جانب الشركات.", significance: "يبدو أن نطاق المخاطَبين بأحكام اللائحة اتسع، مما قد يستدعي مراجعة الجهات المشمولة.", match_assessment: "" },
    { change_id: id("المادة الثانية"), ai_types: ["deadline", "procedural"], summary: "قُلّصت مهلة تقديم التقرير السنوي من ثلاثين يومًا إلى خمسة عشر يومًا.", significance: "قد يترتب على ذلك تعديل جداول الإقفال المالي وإعداد التقارير. وهذه النسخة سارية المفعول حاليًا.", match_assessment: "" },
    { change_id: id("المادة الثالثة"), ai_types: ["amount"], summary: "رُفع الحد الأعلى للغرامة من 50,000 إلى 100,000 ريال.", significance: "يبدو أن الأثر المالي المحتمل للمخالفة تضاعف، ويستحق ذلك المراجعة.", match_assessment: "" },
    { change_id: id("المادة الرابعة"), ai_types: ["responsibility", "procedural"], summary: "أُضيف التزام بتعيين مسؤول امتثال والرفع بالمخالفات خلال خمسة أيام.", significance: "قد يتطلب ذلك استحداث دور وظيفي وإجراء داخلي للإبلاغ.", match_assessment: "لا يبدو أن لهذا الحكم مقابلًا في النسخة السابقة؛ مادة النسخة السابقة بالرقم نفسه نُقلت إلى المادة الخامسة." },
    { change_id: id("المادة الخامسة"), ai_types: [], summary: "لم يتغير النص؛ نُقل الحكم من المادة الرابعة إلى الخامسة.", significance: "قد يلزم تحديث الإحالات الداخلية إلى رقم المادة.", match_assessment: "يبدو أنه الحكم نفسه منقولًا دون تعديل." },
    { change_id: id("المادة السادسة"), ai_types: ["deadline"], summary: "أصبح العمل باللائحة بعد تسعين يومًا من النشر بدلًا من تاريخ النشر.", significance: "قد يمنح ذلك فترة انتقالية، مع ضرورة التحقق من تاريخ النشر الفعلي.", match_assessment: "يبدو أنه حكم النشر نفسه مع إضافة فترة انتقالية." },
  ],
  operational_impacts: [
    { area: "التقارير المالية", description: "قد يلزم تقديم موعد إعداد التقرير السنوي ليتوافق مع مهلة الخمسة عشر يومًا.", change_ids: [id("المادة الثانية")] },
    { area: "الحوكمة والامتثال", description: "قد يتطلب الأمر تعيين مسؤول امتثال وتحديد إجراء للرفع بالمخالفات خلال خمسة أيام.", change_ids: [id("المادة الرابعة")] },
  ],
  checklist: [
    { item: "التحقق مما إذا كانت الجهة مشمولة بالتعريف الموسّع للمنشأة.", change_ids: [id("المادة الأولى")] },
    { item: "تحديث الجدول الزمني لإعداد التقرير السنوي وتقديمه خلال خمسة عشر يومًا.", change_ids: [id("المادة الثانية")] },
    { item: "تعيين مسؤول امتثال واعتماد إجراء للرفع بالمخالفات خلال خمسة أيام.", change_ids: [id("المادة الرابعة")] },
    { item: "التحقق من تاريخ نشر النسخة الجديدة وتاريخ بدء العمل بها.", change_ids: [id("المادة السادسة")] },
  ],
};

let counter = 0;
const sampleId = () => `d0d0e1e1-0000-4000-9000-${String(++counter).padStart(12, "0")}`;

const record = buildRegDeltaRecord({
  planned: changes,
  unchanged,
  previous: { documentId: SAMPLE_PREVIOUS.documentId, fileName: SAMPLE_PREVIOUS.fileName, numbered: previous.numbered, provisions: previous.provisions },
  next: { documentId: SAMPLE_NEXT.documentId, fileName: SAMPLE_NEXT.fileName, numbered: next.numbered, provisions: next.provisions },
  snapshot,
  ai,
  model: "مثال توضيحي",
  now: "2026-01-01T00:00:00.000Z",
  newId: sampleId,
});

export const SAMPLE_REGDELTA = record.content;
export const SAMPLE_REGDELTA_REFERENCES: SourceReferenceRow[] = record.references.map((ref) => ({ ...ref, output_id: "sample", created_at: "2026-01-01T00:00:00.000Z" }));
