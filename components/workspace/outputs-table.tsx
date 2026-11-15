import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/legal/data-table";
import { StatusBadge } from "@/components/legal/status-badge";
import { getToolName } from "@/config/tools";
import { formatDate } from "@/lib/utils";
import type { ReviewStatus, ToolId } from "@/types/legal";

/** One row of an outputs list: a stored output, or a sample in preview mode. */
export interface OutputListItem {
  id: string;
  title: string;
  toolId: ToolId;
  matterLabel: string | null;
  matterHref?: string;
  status: ReviewStatus;
  createdAt: string;
  /** Where the output opens; null when its tool has no output page. */
  href: string | null;
}

const COLUMNS: readonly DataTableColumn<OutputListItem>[] = [
  {
    id: "title",
    header: "المخرج",
    cell: (row) =>
      row.href ? (
        <Link href={row.href} className="font-medium text-foreground underline-offset-4 hover:underline">
          {row.title}
        </Link>
      ) : (
        <span className="font-medium">{row.title}</span>
      ),
  },
  { id: "tool", header: "الأداة", cell: (row) => getToolName(row.toolId) },
  {
    id: "matter",
    header: "الملف",
    cell: (row) =>
      row.matterHref && row.matterLabel ? (
        <Link href={row.matterHref} className="underline-offset-4 hover:underline">
          {row.matterLabel}
        </Link>
      ) : (
        (row.matterLabel ?? "—")
      ),
  },
  { id: "status", header: "حالة المراجعة", cell: (row) => <StatusBadge status={row.status} /> },
  { id: "date", header: "التاريخ", cell: (row) => formatDate(row.createdAt), numeric: true },
];

export function RecentOutputsTable({ outputs, error }: { outputs: readonly OutputListItem[]; error?: string | null }) {
  return (
    <DataTable
      caption="المخرجات"
      columns={COLUMNS}
      rows={outputs}
      error={error}
      getRowId={(row) => row.id}
      emptyTitle="لا توجد مخرجات بعد"
      emptyDescription="ستظهر هنا مخرجات الأدوات بعد تشغيلها، وتبقى مسودات حتى يعتمدها مختص."
    />
  );
}
