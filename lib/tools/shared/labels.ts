import type { SourceKind } from "@/types/database";

/** Shown wherever an extracted item has no verified source. */
export const UNREFERENCED_LABEL = "غير موثّق بمصدر — يتطلب مراجعة";

/** How each kind of source is named in the UI. */
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  document: "مستند",
  pasted_text: "نص ملصق",
  lawyer_notes: "ملاحظات المحامي",
  meeting_transcript: "محضر اجتماع",
  audio_recording: "تسجيل صوتي",
  intake_form: "إجابات نموذج الاستقبال",
  client_statement: "رواية العميل",
};
