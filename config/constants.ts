export const APP_NAME = "Legal Studio";
export const APP_NAME_AR = "ليجال ستوديو";
export const APP_TAGLINE =
  "مساحة عمل قانونية تستعين بالذكاء الاصطناعي لتنظيم المعلومات وتحليلها، مع إبقاء الحكم المهني للمختص.";

/** Persistent professional-responsibility notice shown on every workspace page. */
export const LEGAL_DISCLAIMER =
  "هذه الأدوات مساعدة لتنظيم وتحليل وصياغة المعلومات ولا تمثل رأيًا قانونيًا نهائيًا. تخضع جميع المخرجات للمراجعة البشرية.";

export const APPROVAL_ACKNOWLEDGEMENT = "راجعتُ المخرجات وأتحمل مسؤولية اعتمادها";

/**
 * Document formats accepted for upload: MIME type → allowed extensions.
 * Shared by the browser (UploadArea) and the server (upload route). The server
 * additionally checks file signatures, and the storage bucket enforces the same list.
 */
export const UPLOAD_ACCEPT = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "application/rtf": [".rtf"],
  "application/vnd.oasis.opendocument.text": [".odt"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "audio/mpeg": [".mp3"],
  "audio/mp4": [".m4a"],
  "audio/wav": [".wav"],
  "audio/webm": [".webm"],
  "audio/ogg": [".ogg"],
} as const;

/** Audio sources are transcribed before they can be cited. */
export const AUDIO_MIME_TYPES: readonly UploadMimeType[] = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/webm", "audio/ogg"];

export type UploadMimeType = keyof typeof UPLOAD_ACCEPT;

/** Human-readable list for messages, e.g. "PDF، DOCX، …". */
export const UPLOAD_FORMATS_LABEL = "PDF، DOCX، DOC، RTF، ODT، TXT، MD، وتسجيلات صوتية MP3، M4A، WAV، WEBM، OGG";

/** 20 MB. Must match documents.file_size_bytes and the bucket's file_size_limit. */
export const UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

/** Private Supabase Storage bucket for matter documents. */
export const DOCUMENTS_BUCKET = "matter-documents";

/** Routes that do not require a session. Everything else is the protected workspace. */
export const PUBLIC_ROUTES = ["/login", "/signup", "/auth"] as const;
