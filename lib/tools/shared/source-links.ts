import type { SourceReferenceRow } from "@/types/database";

/** One verified source behind an item: which document, where in it, and the excerpt. */
export interface SourceLink {
  number: number;
  referenceId: string;
  documentId: string;
  documentName: string;
  location: string | null;
  excerpt: string;
  /** Opens the original file through the authorised download route. */
  href: string;
}

/** Numbers reference ids [م n] in the order the given groups list them. */
export function numberReferences(groups: Iterable<string[]>): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const ids of groups) for (const id of ids) if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
  return numbers;
}

/** Resolves reference ids to source links. Ids without a stored reference are skipped, never invented. */
export function resolveSourceLinks(
  referenceIds: string[],
  references: SourceReferenceRow[],
  documentNames: Map<string, string>,
  numbers: Map<string, number>,
): SourceLink[] {
  const byId = new Map(references.map((ref) => [ref.id, ref]));
  return referenceIds.flatMap((id) => {
    const ref = byId.get(id);
    if (!ref) return [];
    return [
      {
        number: numbers.get(id) ?? 0,
        referenceId: id,
        documentId: ref.document_id,
        documentName: documentNames.get(ref.document_id) ?? "مستند محذوف",
        location: ref.page_or_section,
        excerpt: ref.source_text,
        href: `/api/documents/${ref.document_id}/download`,
      },
    ];
  });
}
