import { z } from "zod";
import type { DocumentRow } from "@/types/database";
import { parseSegmentsValue } from "./segments";
import type { IndexedSource } from "./citations";

/** Above this, a tool refuses the request rather than silently truncating sources. */
export const MAX_SOURCE_CHARS = 600_000;

/** Processing state of every matter source at generation time, stored with the output. */
export const sourceSnapshotSchema = z.object({
  document_id: z.string().uuid(),
  label: z.string(),
  file_name: z.string(),
  source_kind: z.string(),
  processing_status: z.string(),
  processing_error: z.string().nullable(),
  included: z.boolean(),
});

export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;

/** Indexes processed sources as S1, S2… (oldest first) and snapshots every source's state. */
export function indexSources(documents: DocumentRow[]): { sources: IndexedSource[]; snapshot: SourceSnapshot[] } {
  const ordered = [...documents].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sources: IndexedSource[] = [];
  const snapshot: SourceSnapshot[] = [];
  for (const document of ordered) {
    const segments = document.processing_status === "processed" ? parseSegmentsValue(document.segments) : [];
    const included = segments.length > 0;
    const label = included ? `S${sources.length + 1}` : "—";
    if (included) sources.push({ sourceId: label, documentId: document.id, fileName: document.file_name, segments });
    snapshot.push({
      document_id: document.id,
      label,
      file_name: document.file_name,
      source_kind: document.source_kind,
      processing_status: document.processing_status,
      processing_error: document.processing_error,
      included,
    });
  }
  return { sources, snapshot };
}

export function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function totalSourceChars(sources: IndexedSource[]): number {
  return sources.reduce((sum, source) => sum + source.segments.reduce((n, s) => n + s.text.length, 0), 0);
}

/** The <sources> block every tool sends: source ids, segment ids and labels, escaped content. */
export function buildSourcesBlock(sources: IndexedSource[]): string {
  const body = sources
    .map(
      (source) =>
        `<source id="${source.sourceId}" name="${escapeXml(source.fileName)}">\n` +
        source.segments
          .map((segment) => `<segment id="${segment.id}" label="${escapeXml(segment.label)}">\n${escapeXml(segment.text)}\n</segment>`)
          .join("\n") +
        `\n</source>`,
    )
    .join("\n");
  return `<sources>\n${body}\n</sources>`;
}

/** Matter header for prompts. The description is user-written and explicitly not a source of facts. */
export function buildMatterBlock(matter: { name: string; type: string | null; client: string | null; description: string | null }): string {
  const header = [
    `اسم الملف: ${matter.name}`,
    matter.type ? `نوع الملف: ${matter.type}` : null,
    matter.client ? `العميل: ${matter.client}` : null,
    matter.description ? `وصف الملف (من المستخدم، ليس مصدرًا للوقائع): ${matter.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `<matter>\n${escapeXml(header)}\n</matter>`;
}
