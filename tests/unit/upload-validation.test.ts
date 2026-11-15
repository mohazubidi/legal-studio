import { describe, expect, it } from "vitest";
import { UPLOAD_MAX_BYTES } from "@/config/constants";
import {
  documentStoragePath,
  precheckUpload,
  sanitizeFileName,
  validateUpload,
} from "@/lib/documents/validation";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

const PDF = text("%PDF-1.7\n");
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);
const OLE = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);

describe("validateUpload", () => {
  it.each([
    ["contract.pdf", "application/pdf", PDF],
    ["مذكرة.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ZIP],
    ["old.doc", "application/msword", OLE],
    ["note.rtf", "text/rtf", text("{\\rtf1\\ansi")],
    ["brief.odt", "", ZIP],
    ["facts.txt", "text/plain", text("الوقائع: ...")],
    ["readme.md", "text/x-markdown", text("# عنوان")],
  ])("accepts %s", (name, type, head) => {
    const result = validateUpload({ name, size: 100, type }, head);
    expect(result.ok).toBe(true);
  });

  it("rejects unsupported extensions", () => {
    const result = validateUpload({ name: "run.exe", size: 100, type: "application/octet-stream" }, bytes(0x4d, 0x5a));
    expect(result).toMatchObject({ ok: false, reason: "unsupported_type" });
  });

  it("rejects a file whose content does not match its extension", () => {
    const result = validateUpload({ name: "invoice.pdf", size: 100, type: "application/pdf" }, ZIP);
    expect(result).toMatchObject({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a declared MIME type that contradicts the extension", () => {
    const result = validateUpload({ name: "contract.pdf", size: 100, type: "text/html" }, PDF);
    expect(result).toMatchObject({ ok: false, reason: "mime_mismatch" });
  });

  it("rejects binary content disguised as text", () => {
    const result = validateUpload({ name: "notes.txt", size: 100, type: "text/plain" }, bytes(0x41, 0x00, 0x42));
    expect(result).toMatchObject({ ok: false, reason: "signature_mismatch" });
  });

  it("enforces the size limit and rejects empty files", () => {
    expect(validateUpload({ name: "big.pdf", size: UPLOAD_MAX_BYTES + 1, type: "application/pdf" }, PDF)).toMatchObject({
      ok: false,
      reason: "too_large",
    });
    expect(validateUpload({ name: "empty.pdf", size: 0, type: "application/pdf" }, PDF)).toMatchObject({
      ok: false,
      reason: "empty",
    });
  });

  it("matches extensions case-insensitively", () => {
    expect(validateUpload({ name: "SCAN.PDF", size: 10, type: "application/pdf" }, PDF).ok).toBe(true);
  });
});

describe("sanitizeFileName", () => {
  it("strips paths, control and bidi-override characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\a\\عقد.pdf")).toBe("عقد.pdf");
    expect(sanitizeFileName("invoice\u202Efdp.exe")).toBe("invoicefdp.exe");
  });

  it("rejects names that end up empty or hidden", () => {
    expect(precheckUpload({ name: "/", size: 10 })).not.toBeNull();
    expect(precheckUpload({ name: ".pdf", size: 10 })).not.toBeNull();
  });
});

describe("documentStoragePath", () => {
  it("is ASCII-only and scoped to matter and document", () => {
    const path = documentStoragePath("m-1", "d-2", ".pdf");
    expect(path).toBe("m-1/d-2/source.pdf");
    expect(/^[\x20-\x7e]+$/.test(path)).toBe(true);
  });
});
