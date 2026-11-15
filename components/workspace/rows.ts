import { DOCUMENTS, MATTERS, OUTPUTS, getMatter as getSampleMatter } from "@/data/mock";
import type { OutputListRow } from "@/lib/data/workspace";
import { outputHref, TOOL_ID_BY_TYPE } from "@/lib/tools/shared/output-links";
import type { MatterRow } from "@/types/database";
import type { MatterListItem } from "./matters-table";
import type { OutputListItem } from "./outputs-table";

/** Stored rows → list rows. Samples (preview mode) keep their reference numbers and have no links. */
export function matterItems(matters: MatterRow[]): MatterListItem[] {
  return matters.map((m) => ({
    id: m.id,
    title: m.matter_name,
    client: m.client_name,
    practiceArea: m.matter_type,
    status: m.status,
    updatedAt: m.updated_at,
    href: `/matters/${m.id}`,
  }));
}

export function outputItems(outputs: OutputListRow[]): OutputListItem[] {
  return outputs.map((o) => ({
    id: o.id,
    title: o.title,
    toolId: TOOL_ID_BY_TYPE[o.tool_type],
    matterLabel: o.matter?.matter_name ?? null,
    matterHref: o.matter ? `/matters/${o.matter.id}` : undefined,
    status: o.status,
    createdAt: o.created_at,
    href: outputHref(o.tool_type, o.id),
  }));
}

export const SAMPLE_MATTER_ITEMS: MatterListItem[] = MATTERS.map((m) => ({ ...m }));
export const SAMPLE_OUTPUT_ITEMS: OutputListItem[] = OUTPUTS.map((o) => ({
  id: o.id,
  title: o.title,
  toolId: o.toolId,
  matterLabel: getSampleMatter(o.matterId)?.reference ?? null,
  status: o.status,
  createdAt: o.createdAt,
  href: `/outputs/${o.id}`,
}));
export const SAMPLE_DOCUMENT_COUNT = DOCUMENTS.length;
