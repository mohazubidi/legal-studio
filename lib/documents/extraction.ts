import type { UploadMimeType } from "@/config/constants";
import type { DocumentSegment } from "@/types/database";

/**
 * Stage 1: turn a stored file into citable text segments.
 *   PDF          → one segment per page ("صفحة n")
 *   DOCX/TXT/MD  → paragraphs grouped into sections ("فقرة n–m")
 *   RTF          → control words stripped, then as plain text
 * Audio is handled by the transcription provider, not here.
 */

export type ExtractionResult =
  | { ok: true; segments: DocumentSegment[]; text: string }
  | { ok: false; message: string };

/** Paragraph groups are kept small enough to cite precisely. */
const MAX_SECTION_CHARS = 1500;

export const NO_TEXT_MESSAGE = "لا يحتوي الملف على نص قابل للاستخراج (قد يكون ممسوحًا ضوئيًا أو صورة).";

function normalizeText(text: string): string {
  return text
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function joinSegments(segments: DocumentSegment[]): string {
  return segments.map((segment) => `[${segment.label}]\n${segment.text}`).join("\n\n");
}

function result(segments: DocumentSegment[]): ExtractionResult {
  const kept = segments.filter((segment) => segment.text.length > 0);
  if (kept.length === 0) return { ok: false, message: NO_TEXT_MESSAGE };
  return { ok: true, segments: kept, text: joinSegments(kept) };
}

/** Groups paragraphs into sections labelled by paragraph range, never splitting a paragraph. */
export function segmentParagraphs(raw: string): DocumentSegment[] {
  const paragraphs = normalizeText(raw)
    .split(/\n\s*\n|\n(?=\s*(?:[-•*]|\d+[.)]|[٠-٩]+[.)]))/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const segments: DocumentSegment[] = [];
  let start = 0;
  let buffer: string[] = [];
  let length = 0;

  const flush = (end: number) => {
    if (buffer.length === 0) return;
    const index = segments.length + 1;
    const label = start + 1 === end ? `فقرة ${end}` : `فقرات ${start + 1}–${end}`;
    segments.push({ id: `s${index}`, label, text: buffer.join("\n\n") });
    buffer = [];
    length = 0;
  };

  paragraphs.forEach((paragraph, i) => {
    if (buffer.length > 0 && length + paragraph.length > MAX_SECTION_CHARS) {
      flush(i);
      start = i;
    }
    if (buffer.length === 0) start = i;
    buffer.push(paragraph);
    length += paragraph.length;
  });
  flush(paragraphs.length);
  return segments;
}

/** RTF header groups whose content is never document text. */
const RTF_SKIPPED_GROUPS = /^\{\\(?:\*|fonttbl|colortbl|stylesheet|info|listtable|listoverridetable|rsidtbl|generator|themedata|colorschememapping|latentstyles|datastore|xmlnstbl|pict|object)/;

/** Removes whole header/destination groups, honouring nested braces and escapes. */
function stripRtfGroups(rtf: string): string {
  let out = "";
  for (let i = 0; i < rtf.length; i += 1) {
    if (rtf[i] === "\\" && i + 1 < rtf.length) {
      out += rtf[i] + rtf[i + 1];
      i += 1;
      continue;
    }
    if (rtf[i] === "{" && RTF_SKIPPED_GROUPS.test(rtf.slice(i, i + 40))) {
      let depth = 0;
      for (; i < rtf.length; i += 1) {
        if (rtf[i] === "\\") {
          i += 1;
          continue;
        }
        if (rtf[i] === "{") depth += 1;
        if (rtf[i] === "}" && --depth === 0) break;
      }
      continue;
    }
    out += rtf[i];
  }
  return out;
}

/** Removes RTF control words and groups, keeping text and \uN unicode escapes. */
export function rtfToText(input: string): string {
  const rtf = stripRtfGroups(input);
  // \'xx escapes are bytes in the document's ANSI code page (Arabic RTF is usually 1256).
  const codePage = /\\ansicpg(\d+)/.exec(input)?.[1] ?? "1252";
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(`windows-${codePage}`);
  } catch {
    decoder = new TextDecoder("windows-1252");
  }
  return rtf
    .replace(/\\u(-?\d+)\??/g, (_, code: string) => {
      const n = Number(code);
      return String.fromCharCode(n < 0 ? n + 65536 : n);
    })
    .replace(/(?:\\'[0-9a-f]{2})+/gi, (run: string) =>
      decoder.decode(Uint8Array.from(run.match(/[0-9a-f]{2}/gi) ?? [], (hex) => parseInt(hex, 16))),
    )
    .replace(/\\(?:par|line)\b ?/g, "\n")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\\([\\{}])/g, "$1");
}

export const VISUAL_ORDER_MESSAGE =
  "النص العربي في ملف PDF هذا مخزّن بترتيب العرض لا بترتيب القراءة، فيُستخرج مقلوبًا وغير قابل للاستشهاد. صدّر المستند من محرر النصوص بصيغة DOCX أو PDF وأعد رفعه.";

/** Arabic letters vs. Arabic presentation forms (contextual glyph codes, U+FB50–U+FDFF and U+FE70–U+FEFF). */
const ARABIC_LETTER = /[\u0621-\u064A]/gu;
const ARABIC_PRESENTATION_FORM = /[\uFB50-\uFDFF\uFE70-\uFEFF]/gu;

/**
 * Some PDF producers (browser "print to PDF", for one) store Arabic as shaped
 * glyphs in display order. Text extracted from them is reversed and unreadable,
 * so it must not be offered as a source. Logical-order PDFs map glyphs back to
 * base letters, so presentation forms are rare in their extracted text.
 */
export function looksLikeVisualOrderArabic(text: string): boolean {
  const forms = text.match(ARABIC_PRESENTATION_FORM)?.length ?? 0;
  const letters = text.match(ARABIC_LETTER)?.length ?? 0;
  return forms >= 20 && forms / (forms + letters) > 0.3;
}

async function extractPdf(bytes: Uint8Array): Promise<ExtractionResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: false });
  if (looksLikeVisualOrderArabic(text.join("\n"))) return { ok: false, message: VISUAL_ORDER_MESSAGE };
  return result(text.map((page, index) => ({ id: `p${index + 1}`, label: `صفحة ${index + 1}`, text: normalizeText(page) })));
}

async function extractDocx(bytes: Uint8Array): Promise<ExtractionResult> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return result(segmentParagraphs(value));
}

/** Formats that cannot be extracted yet; they are kept as failed with a clear reason. */
const UNSUPPORTED: Partial<Record<UploadMimeType, string>> = {
  "application/msword": "استخراج النص من ملفات DOC القديمة غير مدعوم بعد. احفظ الملف بصيغة DOCX أو PDF وأعد رفعه.",
  "application/vnd.oasis.opendocument.text": "استخراج النص من ملفات ODT غير مدعوم بعد. احفظ الملف بصيغة DOCX أو PDF وأعد رفعه.",
};

export async function extractSegments(mimeType: string, bytes: Uint8Array): Promise<ExtractionResult> {
  const unsupported = UNSUPPORTED[mimeType as UploadMimeType];
  if (unsupported) return { ok: false, message: unsupported };

  try {
    switch (mimeType) {
      case "application/pdf":
        return await extractPdf(bytes);
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return await extractDocx(bytes);
      case "application/rtf":
        return result(segmentParagraphs(rtfToText(new TextDecoder("latin1").decode(bytes))));
      case "text/plain":
      case "text/markdown":
        return result(segmentParagraphs(new TextDecoder("utf-8").decode(bytes)));
      default:
        return { ok: false, message: "لا يمكن استخراج نص من هذا النوع من الملفات." };
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `تعذّر قراءة الملف: ${detail}`.slice(0, 500) };
  }
}

/**
 * Segments intake form answers ("السؤال: …\nالإجابة: …" blocks) one question
 * per segment, labelled by the question, so citations point at the exact answer.
 */
export function segmentQuestionAnswers(raw: string): DocumentSegment[] {
  return normalizeText(raw)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => {
      const question = /^السؤال:\s*(.+)$/m.exec(block)?.[1]?.trim();
      return { id: `q${index + 1}`, label: question ? `سؤال: ${question}`.slice(0, 80) : `فقرة ${index + 1}`, text: block };
    });
}
