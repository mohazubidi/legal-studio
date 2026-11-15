import { z } from "zod";
import type { RegDeltaContent } from "./content";
import { AI_CHANGE_TYPES } from "./model-schema";

/** What a reviewer may edit: interpretation only. Extracted texts, locations and detected types are fixed. */
export const regDeltaEditsSchema = z.object({
  changes: z
    .array(
      z.object({
        id: z.string().max(20),
        summary: z.string().max(5000),
        significance: z.string().max(10000),
        ai_types: z.array(z.enum(AI_CHANGE_TYPES)).max(AI_CHANGE_TYPES.length),
        excluded: z.boolean(),
      }),
    )
    .max(2000),
  impacts: z.array(z.object({ id: z.string().max(60).optional(), area: z.string().trim().max(300), description: z.string().trim().min(1).max(5000), change_ids: z.array(z.string().max(20)).max(500) })).max(500),
  checklist: z.array(z.object({ id: z.string().max(60).optional(), item: z.string().trim().min(1).max(2000), change_ids: z.array(z.string().max(20)).max(500) })).max(500),
});

export type RegDeltaEdits = z.input<typeof regDeltaEditsSchema>;

/** Applies validated edits to stored content (pure; ids that do not exist are ignored). */
export function applyRegDeltaEdits(content: RegDeltaContent, edits: z.output<typeof regDeltaEditsSchema>, now: string, newId: () => string): RegDeltaContent {
  const changeIds = new Set(content.changes.map((c) => c.id));
  const editById = new Map(edits.changes.map((e) => [e.id, e]));
  const linked = (ids: string[]) => [...new Set(ids.filter((id) => changeIds.has(id)))];
  const impactsById = new Map(content.impacts.map((i) => [i.id, i]));
  const checklistById = new Map(content.checklist.map((c) => [c.id, c]));

  return {
    ...content,
    changes: content.changes.map((change) => {
      const edit = editById.get(change.id);
      if (!edit) return change;
      const differs =
        edit.summary !== change.summary ||
        edit.significance !== change.significance ||
        edit.excluded !== change.excluded ||
        [...edit.ai_types].sort().join() !== [...change.ai_types].sort().join();
      return differs ? { ...change, summary: edit.summary, significance: edit.significance, ai_types: [...new Set(edit.ai_types)], excluded: edit.excluded, edited: true } : change;
    }),
    impacts: edits.impacts.map((item) => {
      const existing = item.id ? impactsById.get(item.id) : undefined;
      const next = { area: item.area, description: item.description, change_ids: linked(item.change_ids) };
      if (existing && existing.area === next.area && existing.description === next.description && existing.change_ids.join() === next.change_ids.join()) return existing;
      return { id: existing?.id ?? newId(), ...next, edited: true };
    }),
    checklist: edits.checklist.map((item) => {
      const existing = item.id ? checklistById.get(item.id) : undefined;
      const next = { item: item.item, change_ids: linked(item.change_ids) };
      if (existing && existing.item === next.item && existing.change_ids.join() === next.change_ids.join()) return existing;
      return { id: existing?.id ?? newId(), ...next, edited: true };
    }),
    last_edited_at: now,
  };
}

