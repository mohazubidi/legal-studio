import { describe, expect, it } from "vitest";
import { extractSegments, rtfToText, segmentParagraphs } from "@/lib/documents/extraction";
import { validateUpload } from "@/lib/documents/validation";
import { segmentsFromTranscript } from "@/lib/ai/transcription";

const encode = (text: string) => new TextEncoder().encode(text);

/** Builds a minimal valid PDF with one text line per page (correct xref offsets). */
function makePdf(pages: string[]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_, i) => 3 + i * 2);
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  const fontId = 3 + pages.length * 2;
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encode(body);
}

describe("segmentParagraphs", () => {
  it("labels paragraphs by position", () => {
    const segments = segmentParagraphs("الفقرة الأولى.\n\nالفقرة الثانية.");
    expect(segments).toEqual([{ id: "s1", label: "فقرات 1–2", text: "الفقرة الأولى.\n\nالفقرة الثانية." }]);
  });

  it("starts a new section when a group would get too long, without splitting paragraphs", () => {
    const long = "أ".repeat(1000);
    const segments = segmentParagraphs(`${long}\n\n${long}\n\n${long}`);
    expect(segments.map((s) => s.label)).toEqual(["فقرة 1", "فقرة 2", "فقرة 3"]);
  });
});

describe("rtfToText", () => {
  it("decodes Arabic bytes in the document code page", () => {
    // "عقد" in windows-1256 is E3 DE CF.
    const text = rtfToText("{\\rtf1\\ansi\\ansicpg1256 {\\fonttbl{\\f0 Arial;}}\\f0 \\'da\\'de\\'cf\\par}");
    expect(text.trim()).toBe("عقد");
  });

  it("decodes \\u escapes", () => {
    expect(rtfToText("{\\rtf1 \\u1593?\\u1602?\\u1583?}").trim()).toBe("عقد");
  });
});

describe("extractSegments", () => {
  it("segments plain text", async () => {
    const result = await extractSegments("text/plain", encode("بند أول\n\nبند ثانٍ"));
    expect(result.ok && result.segments.length).toBe(1);
  });

  it("fails clearly for formats it cannot extract yet", async () => {
    const result = await extractSegments("application/msword", new Uint8Array([0xd0, 0xcf]));
    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.message).toContain("DOCX");
  });

  it("reports empty text instead of producing an empty source", async () => {
    const result = await extractSegments("text/plain", encode("   \n\n "));
    expect(result.ok).toBe(false);
  });

  it("extracts PDF text page by page with page labels", async () => {
    const result = await extractSegments("application/pdf", makePdf(["Delivery within 30 days", "Contract value 450000 SAR"]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.segments.map((s) => [s.id, s.label])).toEqual([
      ["p1", "صفحة 1"],
      ["p2", "صفحة 2"],
    ]);
    expect(result.segments[1].text).toContain("450000");
  });

  it("reports unreadable PDFs as errors rather than throwing", async () => {
    const result = await extractSegments("application/pdf", encode("%PDF-1.7 not really a pdf"));
    expect(result.ok).toBe(false);
  });
});

describe("transcript segments", () => {
  it("groups timed spans with time-range labels", () => {
    const segments = segmentsFromTranscript(
      {
        text: "...",
        segments: [
          { start: 0, end: 4.2, text: "بدأ الاجتماع" },
          { start: 4.2, end: 65, text: "ناقشنا التأخير" },
        ],
      },
      12,
    );
    expect(segments.map((s) => s.label)).toEqual(["00:00:00–00:00:04", "00:00:04–00:01:05"]);
  });

  it("falls back to the full text when no spans are returned", () => {
    expect(segmentsFromTranscript({ text: " نص كامل " })).toEqual([{ id: "t1", label: "التفريغ الكامل", text: "نص كامل" }]);
  });
});

describe("audio uploads", () => {
  it.each([
    ["meeting.mp3", "audio/mpeg", [0x49, 0x44, 0x33, 0x04]],
    ["call.m4a", "audio/x-m4a", [0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]],
    ["memo.wav", "audio/wav", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]],
    ["rec.webm", "audio/webm", [0x1a, 0x45, 0xdf, 0xa3]],
    ["rec.ogg", "audio/ogg", [0x4f, 0x67, 0x67, 0x53]],
  ])("accepts %s", (name, type, head) => {
    expect(validateUpload({ name, size: 100, type }, new Uint8Array(head)).ok).toBe(true);
  });

  it("rejects a non-audio file named .mp3", () => {
    expect(validateUpload({ name: "x.mp3", size: 100, type: "audio/mpeg" }, encode("%PDF-1.7"))).toMatchObject({
      ok: false,
      reason: "signature_mismatch",
    });
  });
});
