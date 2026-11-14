export const APP_NAME = "Legal Studio";
export const APP_NAME_AR = "ليجال ستوديو";
export const APP_TAGLINE =
  "مساحة عمل قانونية تستعين بالذكاء الاصطناعي لتنظيم المعلومات وتحليلها، مع إبقاء الحكم المهني للمختص.";

/** Persistent professional-responsibility notice shown on every workspace page. */
export const LEGAL_DISCLAIMER =
  "هذه الأدوات مساعدة لتنظيم وتحليل وصياغة المعلومات ولا تمثل رأيًا قانونيًا نهائيًا. تخضع جميع المخرجات للمراجعة البشرية.";

export const APPROVAL_ACKNOWLEDGEMENT = "راجعتُ المخرجات وأتحمل مسؤولية اعتمادها";

export const UPLOAD_ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
} as const;

export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

/** Routes that do not require a session. Everything else is the protected workspace. */
export const PUBLIC_ROUTES = ["/login", "/signup", "/auth"] as const;
