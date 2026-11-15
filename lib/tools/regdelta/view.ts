import { numberReferences, resolveSourceLinks, type SourceLink } from "@/lib/tools/shared/source-links";
import type { SourceReferenceRow } from "@/types/database";
import type { DetectedType } from "./compare";
import { AI_TYPE_LABELS, DETECTED_TYPE_LABELS, type RegDeltaChange, type RegDeltaContent } from "./content";
import type { AiChangeType } from "./model-schema";

export interface TypeBadge {
  key: string;
  label: string;
  /** "detected" = derived from the text by the server; "ai" = suggested by the model. */
  origin: "detected" | "ai";
}

/** Detected types first; AI types only when they add something the text comparison did not detect. */
export function changeTypeBadges(change: Pick<RegDeltaChange, "detected_types" | "ai_types">): TypeBadge[] {
  const detected = change.detected_types.map((type) => ({ key: type, label: DETECTED_TYPE_LABELS[type], origin: "detected" as const }));
  const seen = new Set<string>(change.detected_types);
  const ai = change.ai_types.filter((type) => !seen.has(type)).map((type) => ({ key: type, label: AI_TYPE_LABELS[type], origin: "ai" as const }));
  return [...detected, ...ai];
}

export type ChangeFilter = "all" | "uncertain" | DetectedType | AiChangeType;

export function matchesFilter(change: RegDeltaChange, filter: ChangeFilter): boolean {
  if (filter === "all") return true;
  if (filter === "uncertain") return change.uncertainty !== null;
  return (change.detected_types as string[]).includes(filter) || (change.ai_types as string[]).includes(filter);
}

/** Changes for the current filter; excluded changes are hidden unless asked for. */
export function filterChanges(changes: RegDeltaChange[], filter: ChangeFilter, includeExcluded = false): RegDeltaChange[] {
  return changes.filter((change) => (includeExcluded || !change.excluded) && matchesFilter(change, filter));
}

/** How many (non-excluded) changes each filter would show. */
export function filterCounts(changes: RegDeltaChange[]): Record<string, number> {
  const counts: Record<string, number> = { all: 0, uncertain: 0 };
  for (const change of changes) {
    if (change.excluded) continue;
    counts.all += 1;
    if (change.uncertainty) counts.uncertain += 1;
    for (const badge of changeTypeBadges(change)) counts[badge.key] = (counts[badge.key] ?? 0) + 1;
  }
  return counts;
}

export interface ChangeSources {
  previous: SourceLink | null;
  next: SourceLink | null;
}

/** [م n] numbering: previous then new side of each change, in change order. */
export function numberRegDeltaReferences(content: RegDeltaContent): Map<string, number> {
  return numberReferences(content.changes.map((c) => [c.previous?.reference_id, c.next?.reference_id].filter((id): id is string => Boolean(id))));
}

/** Source location of a change in each version: document, article and page, excerpt, link to the file. */
export function getChangeSources(change: RegDeltaChange, references: SourceReferenceRow[], content: RegDeltaContent, numbers = numberRegDeltaReferences(content)): ChangeSources {
  const names = new Map(content.sources.map((s) => [s.document_id, s.file_name]));
  const one = (id: string | undefined) => (id ? (resolveSourceLinks([id], references, names, numbers)[0] ?? null) : null);
  return { previous: one(change.previous?.reference_id), next: one(change.next?.reference_id) };
}

/** URL that reopens a comparison on one change and side (?change=C3&side=previous). */
export function changeHref(outputId: string, changeId: string, side: "previous" | "next"): string {
  return `/tools/regdelta/${outputId}?${new URLSearchParams({ change: changeId, side }).toString()}`;
}

export function parseChangeParams(params: { change?: string | string[]; side?: string | string[] }, content: RegDeltaContent): { change: string | null; side: "previous" | "next" | null } {
  const change = typeof params.change === "string" && content.changes.some((c) => c.id === params.change) ? params.change : null;
  const side = params.side === "previous" || params.side === "next" ? params.side : null;
  return { change, side: change ? side : null };
}
