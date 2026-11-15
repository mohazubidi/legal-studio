import { UPLOAD_ACCEPT, UPLOAD_FORMATS_LABEL, UPLOAD_MAX_BYTES, type UploadMimeType } from "@/config/constants";
import { formatFileSize } from "@/lib/utils";

/** Bytes needed from the start of a file to check its signature. */
export const SIGNATURE_BYTES = 8192;

export type UploadRejection =
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "mime_mismatch"
  | "signature_mismatch"
  | "invalid_name";

export type UploadValidation =
  | { ok: true; mimeType: UploadMimeType; extension: string; fileName: string }
  | { ok: false; reason: UploadRejection; message: string };

const EXTENSION_TO_MIME = new Map<string, UploadMimeType>(
  (Object.entries(UPLOAD_ACCEPT) as [UploadMimeType, readonly string[]][]).flatMap(([mime, exts]) =>
    exts.map((ext) => [ext, mime] as const),
  ),
);

/** MIME types browsers commonly report for each canonical type. */
const MIME_ALIASES: Record<UploadMimeType, readonly string[]> = {
  "application/pdf": ["application/x-pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["application/zip"],
  "application/msword": [],
  "application/rtf": ["text/rtf", "application/x-rtf", "text/richtext"],
  "application/vnd.oasis.opendocument.text": ["application/zip"],
  "text/plain": [],
  "text/markdown": ["text/x-markdown", "text/plain"],
};

/** Declared types that carry no information and defer to the extension + signature. */
const GENERIC_MIME = new Set(["", "application/octet-stream"]);

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.length <= bytes.length && signature.every((byte, index) => bytes[index] === byte);
}

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const RTF = [0x7b, 0x5c, 0x72, 0x74, 0x66]; // {\rtf

function isPlainText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  // Allow a multi-byte character to be cut at the end of the sample.
  const sample = bytes.length >= SIGNATURE_BYTES ? bytes.subarray(0, bytes.length - 3) : bytes;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return true;
  } catch {
    return false;
  }
}

/** True when the leading bytes match the format implied by the MIME type. */
export function matchesSignature(mimeType: UploadMimeType, head: Uint8Array): boolean {
  switch (mimeType) {
    case "application/pdf":
      return startsWith(head, PDF);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.oasis.opendocument.text":
      return startsWith(head, ZIP);
    case "application/msword":
      return startsWith(head, OLE);
    case "application/rtf":
      return startsWith(head, RTF);
    case "text/plain":
    case "text/markdown":
      return isPlainText(head);
  }
}

/** Display name: base name only, no control characters, at most 255 characters. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return Array.from(
    base
      .normalize("NFC")
      .replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, "")
      .trim(),
  )
    .slice(0, 255)
    .join("");
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

/**
 * Browser-side pre-check (name, size, extension) for instant feedback.
 * The server repeats every check and adds the MIME and signature checks.
 */
export function precheckUpload(file: { name: string; size: number }): string | null {
  const fileName = sanitizeFileName(file.name);
  if (!fileName || fileName.startsWith(".")) return "اسم الملف غير صالح.";
  if (file.size <= 0) return `الملف «${fileName}» فارغ.`;
  if (file.size > UPLOAD_MAX_BYTES) {
    return `الملف «${fileName}» يتجاوز الحد الأقصى (${formatFileSize(UPLOAD_MAX_BYTES)}).`;
  }
  if (!EXTENSION_TO_MIME.has(fileExtension(fileName))) {
    return `الملف «${fileName}» غير مدعوم. الصيغ المقبولة: ${UPLOAD_FORMATS_LABEL}.`;
  }
  return null;
}

/**
 * Validates an upload from its name, size, declared type and leading bytes.
 * Never trusts the declared MIME type alone: the extension decides the format
 * and the file signature must agree with it.
 */
export function validateUpload(
  file: { name: string; size: number; type: string },
  head: Uint8Array,
): UploadValidation {
  const fileName = sanitizeFileName(file.name);
  if (!fileName || fileName.startsWith(".")) {
    return { ok: false, reason: "invalid_name", message: "اسم الملف غير صالح." };
  }
  if (file.size <= 0) {
    return { ok: false, reason: "empty", message: `الملف «${fileName}» فارغ.` };
  }
  if (file.size > UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      message: `الملف «${fileName}» يتجاوز الحد الأقصى (${formatFileSize(UPLOAD_MAX_BYTES)}).`,
    };
  }

  const extension = fileExtension(fileName);
  const mimeType = EXTENSION_TO_MIME.get(extension);
  if (!mimeType) {
    return {
      ok: false,
      reason: "unsupported_type",
      message: `الملف «${fileName}» غير مدعوم. الصيغ المقبولة: ${UPLOAD_FORMATS_LABEL}.`,
    };
  }

  const declared = file.type.toLowerCase().split(";")[0].trim();
  if (!GENERIC_MIME.has(declared) && declared !== mimeType && !MIME_ALIASES[mimeType].includes(declared)) {
    return {
      ok: false,
      reason: "mime_mismatch",
      message: `نوع الملف «${fileName}» لا يطابق امتداده.`,
    };
  }

  if (!matchesSignature(mimeType, head)) {
    return {
      ok: false,
      reason: "signature_mismatch",
      message: `محتوى الملف «${fileName}» لا يطابق صيغة ${extension.slice(1).toUpperCase()}.`,
    };
  }

  return { ok: true, mimeType, extension, fileName };
}

/**
 * Storage object key for a document. ASCII-only (Supabase Storage rejects many
 * non-ASCII keys); the original, possibly Arabic, name is kept in documents.file_name.
 * Must satisfy the documents_storage_path_scoped check constraint.
 */
export function documentStoragePath(matterId: string, documentId: string, extension: string): string {
  return `${matterId}/${documentId}/source${extension}`;
}
