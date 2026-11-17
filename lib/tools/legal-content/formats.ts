/**
 * The six content formats and their fixed structure. Every format is a
 * predefined sequence of sections ("roles"); the model fills the text, the
 * structure never changes. The "source" section is always built by the server
 * from verified references, never written by the model.
 */

export const CONTENT_FORMATS = ["legal_alert", "carousel", "linkedin_post", "client_update", "faq", "awareness_post"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

/** How a format is laid out: one card per section, one fixed card, or a flowing A4 document. */
export type FormatLayout = "slides" | "card" | "document";

export interface RoleSpec {
  role: string;
  label: string;
  /** What the section must say, for the model and the editor hint. */
  guidance: string;
  /** Hard limits enforced on the server, sized so the text fits the card. */
  maxHeading: number;
  maxBody: number;
  maxBlocks: number;
  /** A verbatim quote of the supplied text is expected in this section. */
  quote: "required" | "allowed" | "none";
}

export interface FormatSpec {
  id: ContentFormat;
  label: string;
  labelEn: string;
  description: string;
  layout: FormatLayout;
  /** Model-written sections, in order. The server appends the source section. */
  roles: RoleSpec[];
  /** A section that may repeat (FAQ questions), with its bounds. */
  repeat?: { role: string; min: number; max: number };
  maxTitle: number;
}

export const SOURCE_ROLE: RoleSpec = {
  role: "source",
  label: "المصدر",
  guidance: "يُعدّه الخادم من المصادر المستشهد بها.",
  maxHeading: 60,
  maxBody: 0,
  maxBlocks: 0,
  quote: "none",
};

const role = (r: string, label: string, guidance: string, maxHeading: number, maxBody: number, quote: RoleSpec["quote"], maxBlocks = 3): RoleSpec => ({
  role: r,
  label,
  guidance,
  maxHeading,
  maxBody,
  maxBlocks,
  quote,
});

export const FORMAT_SPECS: Record<ContentFormat, FormatSpec> = {
  legal_alert: {
    id: "legal_alert",
    label: "تنبيه قانوني",
    labelEn: "Legal Alert",
    description: "تنبيه موجز عن نص أو تحديث، بصيغة مستند صفحة واحدة.",
    layout: "document",
    maxTitle: 110,
    roles: [
      role("summary", "الملخص", "ما الموضوع في جملتين أو ثلاث، دون أحكام.", 70, 420, "allowed", 2),
      role("key_points", "أبرز ما ورد", "ما ينص عليه المصدر، مع اقتباس حرفي واحد على الأقل.", 70, 700, "required", 4),
      role("who_affected", "من يعنيه الأمر", "الفئات المذكورة أو المعنية صراحة في المصدر.", 70, 380, "allowed", 2),
      role("takeaway", "ما يستحق الانتباه", "نقطة عملية عامة مستمدة من المصدر، دون نصيحة لحالة بعينها.", 70, 380, "none", 2),
    ],
  },
  carousel: {
    id: "carousel",
    label: "عرض شرائح (كاروسيل)",
    labelEn: "Carousel",
    description: "سبع شرائح بترتيب ثابت: الغلاف، السياق، النقطة الرئيسية، الشرح، الأثر، الخلاصة العملية، المصدر.",
    layout: "slides",
    maxTitle: 90,
    roles: [
      role("cover", "الغلاف", "عنوان جذاب ودقيق وسطر تمهيدي قصير.", 90, 140, "none", 1),
      role("context", "السياق", "ما الذي صدر أو تغيّر، ولمن، كما ورد في المصدر.", 60, 300, "allowed", 2),
      role("key_point", "النقطة الرئيسية", "أهم ما ينص عليه المصدر، باقتباس حرفي.", 60, 300, "required", 2),
      role("explanation", "الشرح", "شرح مبسط للنص المقتبس.", 60, 320, "allowed", 2),
      role("implication", "الأثر", "الأثر العملي المحتمل كما يُفهم من المصدر، بصياغة غير قاطعة.", 60, 300, "none", 2),
      role("takeaway", "الخلاصة العملية", "خلاصة عملية عامة واحدة، دون نصيحة لحالة بعينها.", 60, 240, "none", 2),
    ],
  },
  linkedin_post: {
    id: "linkedin_post",
    label: "منشور لينكدإن",
    labelEn: "LinkedIn Post",
    description: "بطاقة مربعة ونص منشور مصاحب.",
    layout: "card",
    maxTitle: 90,
    roles: [
      role("hook", "الافتتاحية", "سطر افتتاحي يلخص الموضوع.", 90, 160, "none", 1),
      role("body", "المضمون", "ما ينص عليه المصدر مع اقتباس حرفي قصير.", 60, 420, "required", 3),
      role("takeaway", "الخلاصة", "خلاصة عامة من سطر أو سطرين.", 60, 200, "none", 1),
    ],
  },
  client_update: {
    id: "client_update",
    label: "تحديث للعملاء",
    labelEn: "Client Update",
    description: "تحديث رسمي للعملاء بصيغة مستند.",
    layout: "document",
    maxTitle: 110,
    roles: [
      role("summary", "الملخص", "موجز التحديث في فقرة.", 70, 480, "allowed", 2),
      role("details", "التفاصيل", "ما ورد في المصدر بالتفصيل، مع اقتباسات حرفية.", 70, 900, "required", 5),
      role("what_it_means", "ما يعنيه ذلك", "الأثر المحتمل بصياغة غير قاطعة.", 70, 520, "none", 3),
      role("next_steps", "للمتابعة", "ما قد يُراجع أو يُستوضح، بصيغة عامة لا تمثل نصيحة لحالة بعينها.", 70, 420, "none", 3),
    ],
  },
  faq: {
    id: "faq",
    label: "أسئلة شائعة",
    labelEn: "FAQ",
    description: "من ثلاثة إلى ستة أسئلة وأجوبتها، كل جواب مستند إلى المصدر.",
    layout: "document",
    maxTitle: 110,
    roles: [role("qa", "سؤال وجواب", "السؤال في العنوان والجواب في المحتوى، مستند إلى المصدر.", 140, 520, "allowed", 3)],
    repeat: { role: "qa", min: 3, max: 6 },
  },
  awareness_post: {
    id: "awareness_post",
    label: "منشور توعوي",
    labelEn: "Legal Awareness Post",
    description: "بطاقة توعوية مربعة لجمهور عام.",
    layout: "card",
    maxTitle: 80,
    roles: [
      role("key_message", "الرسالة", "الرسالة التوعوية الأساسية في سطر.", 80, 160, "none", 1),
      role("explanation", "التوضيح", "ما ينص عليه المصدر مع اقتباس حرفي قصير.", 60, 340, "required", 2),
      role("tip", "للتذكير", "تذكير عام واحد، دون نصيحة لحالة بعينها.", 60, 180, "none", 1),
    ],
  },
};

export function isContentFormat(value: unknown): value is ContentFormat {
  return typeof value === "string" && (CONTENT_FORMATS as readonly string[]).includes(value);
}

/** The model-written sections in order (FAQ repeats its one role). */
export function roleSpec(format: ContentFormat, role: string): RoleSpec | undefined {
  if (role === SOURCE_ROLE.role) return SOURCE_ROLE;
  return FORMAT_SPECS[format].roles.find((r) => r.role === role);
}
