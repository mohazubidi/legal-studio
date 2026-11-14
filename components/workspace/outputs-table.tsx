import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/legal/data-table";
import { StatusBadge } from "@/components/legal/status-badge";
import { getToolName } from "@/config/tools";
import { getMatter } from "@/data/mock";
import { formatDate } from "@/lib/utils";
import type { Output } from "@/types/legal";

const COLUMNS: readonly DataTableColumn<Output>[] = [
  {
    id: "title",
    header: "المخرج",
    cell: (row) => (
      <Link href={`/outputs/${row.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
        {row.title}
      </Link>
    ),
  },
  { id: "tool", header: "الأداة", cell: (row) => getToolName(row.toolId) },
  { id: "matter", header: "الملف", cell: (row) => getMatter(row.matterId)?.reference ?? "—", numeric: true },
  { id: "status", header: "حالة المراجعة", cell: (row) => <StatusBadge status={row.status} /> },
  { id: "date", header: "التاريخ", cell: (row) => formatDate(row.createdAt), numeric: true },
];

export function RecentOutputsTable({ outputs }: { outputs: readonly Output[] }) {
  return (
    <DataTable
      caption="المخرجات"
      columns={COLUMNS}
      rows={outputs}
      getRowId={(row) => row.id}
      emptyTitle="لا توجد مخرجات بعد"
      emptyDescription="ستظهر هنا مخرجات الأدوات بعد تشغيلها، وتبقى مسودات حتى يعتمدها مختص."
    />
  );
}
