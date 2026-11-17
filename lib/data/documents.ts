import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AUDIO_MIME_TYPES, DOCUMENTS_BUCKET, type UploadMimeType } from "@/config/constants";
import { transcribeAudio } from "@/lib/ai/transcription";
import { extractSegments, segmentParagraphs, segmentQuestionAnswers } from "@/lib/documents/extraction";
import { parseSegmentsValue } from "@/lib/tools/shared/segments";
import { documentStoragePath, SIGNATURE_BYTES, validateUpload } from "@/lib/documents/validation";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { documentMetadataSchema, firstIssue, uuidSchema, type DocumentMetadataInput } from "@/lib/validation/schemas";
import type { DocumentRow, DocumentSegment, Json, SourceKind, TablesUpdate } from "@/types/database";
import { getMatter } from "./matters";
import { fail, fromPostgrest, ok, type DataResult } from "./result";

/** Signed download links are short-lived. */
const DOWNLOAD_URL_TTL_SECONDS = 60;

/** Plain-text formats whose text can be stored immediately, without a processing pipeline. */
const INLINE_TEXT_TYPES = new Set(["text/plain", "text/markdown"]);

/** Postgres text cannot hold NUL; strip it defensively. */
function toStorableText(text: string): string {
  return text.replaceAll("\u0000", "");
}

/** Reads documents.segments defensively (it is jsonb). */
export function parseSegments(value: Json | null): DocumentSegment[] {
  return parseSegmentsValue(value);
}

function isAudio(mimeType: string): boolean {
  return AUDIO_MIME_TYPES.includes(mimeType as UploadMimeType);
}

export async function listDocuments(
  supabase: AppSupabaseClient,
  matterId: string,
): Promise<DataResult<DocumentRow[]>> {
  if (!uuidSchema.safeParse(matterId).success) return fail("not_found", "الملف غير موجود.");
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: false });
  return error ? fromPostgrest(error, "listDocuments") : ok(data);
}

export async function getDocument(supabase: AppSupabaseClient, documentId: string): Promise<DataResult<DocumentRow>> {
  if (!uuidSchema.safeParse(documentId).success) return fail("not_found", "المستند غير موجود.");
  const { data, error } = await supabase.from("documents").select("*").eq("id", documentId).maybeSingle();
  if (error) return fromPostgrest(error, "getDocument");
  return data ? ok(data) : fail("not_found", "المستند غير موجود.");
}

async function markFailed(supabase: AppSupabaseClient, documentId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from("documents")
    .update({ processing_status: "failed", processing_error: message.slice(0, 2000) })
    .eq("id", documentId);
  if (error) console.error("[data] markFailed:", error.message);
}

export interface UploadDocumentInput {
  matterId: string;
  file: File;
  metadata?: DocumentMetadataInput;
  /** Defaults to `audio_recording` for audio and `document` otherwise. */
  sourceKind?: SourceKind;
}

/**
 * Validates and stores one document for a matter the caller owns.
 *
 * 1. Validate metadata, size, extension, declared MIME and file signature.
 * 2. Confirm the matter is visible to the caller (RLS).
 * 3. Insert the documents row with status `pending`. The storage policy only
 *    accepts an object whose path is the storage_path of an owned document.
 * 4. Upload to the private bucket. On failure the row is kept as `failed`
 *    with the error, so the attempt stays visible and can be retried or removed.
 * 5. Mark `uploaded`, or `processed` for plain text whose content is stored now.
 */
export async function uploadDocument(
  supabase: AppSupabaseClient,
  { matterId, file, metadata, sourceKind }: UploadDocumentInput,
): Promise<DataResult<DocumentRow>> {
  const meta = documentMetadataSchema.safeParse(metadata ?? {});
  if (!meta.success) return fail("invalid_input", firstIssue(meta.error));

  const head = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
  const check = validateUpload(file, head);
  if (!check.ok) return fail("invalid_input", check.message);

  const matter = await getMatter(supabase, matterId);
  if (!matter.ok) return matter;

  const documentId = randomUUID();
  const storagePath = documentStoragePath(matterId, documentId, check.extension);

  const { data: created, error: insertError } = await supabase
    .from("documents")
    .insert({
      id: documentId,
      matter_id: matterId,
      file_name: check.fileName,
      file_type: check.mimeType,
      file_size_bytes: file.size,
      storage_path: storagePath,
      document_category: meta.data.document_category,
      document_date: meta.data.document_date,
      source_kind: sourceKind ?? (isAudio(check.mimeType) ? "audio_recording" : "document"),
    })
    .select("*")
    .single();
  if (insertError) return fromPostgrest(insertError, "uploadDocument.insert");

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(storagePath, bytes, {
    contentType: check.mimeType,
    upsert: false,
  });
  if (uploadError) {
    console.error("[data] uploadDocument.storage:", uploadError.message);
    await markFailed(supabase, documentId, `فشل رفع الملف إلى التخزين: ${uploadError.message}`);
    return fail("storage_error", "تعذّر رفع الملف. سُجّلت المحاولة كفاشلة ويمكنك إعادة المحاولة.");
  }

  const inlineText = INLINE_TEXT_TYPES.has(check.mimeType) ? toStorableText(new TextDecoder("utf-8").decode(bytes)) : null;
  const update = inlineText
    ? {
        processing_status: "processed" as const,
        extracted_text: inlineText,
        segments: (sourceKind === "intake_form" ? segmentQuestionAnswers(inlineText) : segmentParagraphs(inlineText)) as unknown as Json,
      }
    : { processing_status: "uploaded" as const };

  const { data: updated, error: updateError } = await supabase
    .from("documents")
    .update(update)
    .eq("id", documentId)
    .select("*")
    .single();
  if (updateError) {
    console.error("[data] uploadDocument.status:", updateError.message);
    // The file is stored; report the row as created so the client is not misled.
    return ok(created);
  }
  return ok(updated);
}

/** Removes the stored object first (its policy needs the row), then the row. */
export async function deleteDocument(supabase: AppSupabaseClient, documentId: string): Promise<DataResult<null>> {
  const document = await getDocument(supabase, documentId);
  if (!document.ok) return document;

  const { error: storageError } = await supabase.storage.from(DOCUMENTS_BUCKET).remove([document.data.storage_path]);
  if (storageError) {
    console.error("[data] deleteDocument.storage:", storageError.message);
    return fail("storage_error", "تعذّر حذف الملف من التخزين.");
  }

  const { error } = await supabase.from("documents").delete().eq("id", documentId);
  return error ? fromPostgrest(error, "deleteDocument") : ok(null);
}

/**
 * Short-lived signed URL for a document the caller can see. The storage select
 * policy re-checks ownership, so a guessed path is not enough. Logged to the audit trail.
 */
export async function createDocumentDownloadUrl(
  supabase: AppSupabaseClient,
  documentId: string,
): Promise<DataResult<{ url: string; fileName: string }>> {
  const document = await getDocument(supabase, documentId);
  if (!document.ok) return document;
  if (document.data.processing_status === "pending" || document.data.processing_status === "failed") {
    const { data: objectExists } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .exists(document.data.storage_path);
    if (!objectExists) return fail("not_found", "لا يوجد ملف محفوظ لهذا المستند.");
  }

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(document.data.storage_path, DOWNLOAD_URL_TTL_SECONDS, { download: document.data.file_name });
  if (error || !data) {
    console.error("[data] createDocumentDownloadUrl:", error?.message);
    return fail("storage_error", "تعذّر إنشاء رابط التنزيل.");
  }

  const { error: auditError } = await supabase.from("audit_logs").insert({
    matter_id: document.data.matter_id,
    action: "document.downloaded",
    details: { id: documentId, file_name: document.data.file_name },
  });
  if (auditError) console.error("[data] audit document.downloaded:", auditError.message);

  return ok({ url: data.signedUrl, fileName: document.data.file_name });
}

const TEXT_SOURCE_LABELS: Record<Exclude<SourceKind, "document" | "audio_recording">, string> = {
  pasted_text: "نص ملصق",
  lawyer_notes: "ملاحظات المحامي",
  meeting_transcript: "محضر اجتماع",
  intake_form: "إجابات نموذج الاستقبال",
  client_statement: "رواية العميل",
  legal_text: "نص قانوني",
  article: "مقال",
  regulation_update: "تحديث تنظيمي",
};

export const textSourceSchema = z.object({
  kind: z.enum(["pasted_text", "lawyer_notes", "meeting_transcript", "intake_form", "client_statement", "legal_text", "article", "regulation_update"]),
  title: z.string().trim().max(120).optional(),
  text: z.string().trim().min(1, "النص فارغ.").max(200_000, "النص أطول من الحد المسموح (200 ألف حرف)."),
});

/**
 * Stores pasted text, lawyer notes or a meeting transcript as a TXT source of
 * the matter, through the same validated upload path as files, so every
 * source has one identity, one storage policy and one citation format.
 */
export async function createTextSource(
  supabase: AppSupabaseClient,
  matterId: string,
  input: z.input<typeof textSourceSchema>,
): Promise<DataResult<DocumentRow>> {
  const parsed = textSourceSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", firstIssue(parsed.error));
  const { kind, title, text } = parsed.data;
  const name = `${(title || TEXT_SOURCE_LABELS[kind]).replace(/[\\/]/g, "-")}.txt`;
  const file = new File([text], name, { type: "text/plain" });
  return uploadDocument(supabase, { matterId, file, sourceKind: kind });
}

/**
 * Stage 1 for one source: download the stored file, extract or transcribe its
 * text into citable segments, and record the outcome. Failures are kept on the
 * row (`failed` + `processing_error`) so they stay visible and can be retried.
 */
export async function processDocument(supabase: AppSupabaseClient, documentId: string): Promise<DataResult<DocumentRow>> {
  const document = await getDocument(supabase, documentId);
  if (!document.ok) return document;
  if (document.data.processing_status === "pending" || document.data.processing_status === "processing") {
    return fail("conflict", "المستند قيد الرفع أو المعالجة حاليًا.");
  }

  const { error: startError } = await supabase
    .from("documents")
    .update({ processing_status: "processing", processing_error: null })
    .eq("id", documentId);
  if (startError) return fromPostgrest(startError, "processDocument.start");

  const finish = async (update: TablesUpdate<"documents">) => {
    const { data, error } = await supabase.from("documents").update(update).eq("id", documentId).select("*").single();
    return error ? fromPostgrest<DocumentRow>(error, "processDocument.finish") : ok(data);
  };
  const failWith = (message: string) =>
    finish({ processing_status: "failed", processing_error: message.slice(0, 2000) });

  const { data: blob, error: downloadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .download(document.data.storage_path);
  if (downloadError || !blob) {
    console.error("[data] processDocument.download:", downloadError?.message);
    return failWith("تعذّر تنزيل الملف من التخزين لمعالجته.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const outcome = isAudio(document.data.file_type)
    ? await transcribeAudio(bytes, document.data.file_type, document.data.file_name)
    : await extractSegments(document.data.file_type, bytes);
  if (!outcome.ok) return failWith(outcome.message);

  return finish({
    processing_status: "processed",
    extracted_text: toStorableText(outcome.text),
    segments: outcome.segments as unknown as Json,
  });
}
