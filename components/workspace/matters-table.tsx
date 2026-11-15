"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/legal/data-table";
import { StatusBadge } from "@/components/legal/status-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import type { MatterStatus } from "@/types/legal";

/** One row of the matters list: a stored matter, or a sample in preview mode. */
export interface MatterListItem {
  id: string;
  reference?: string;
  title: string;
  client: string | null;
  practiceArea: string | null;
  status: MatterStatus;
  updatedAt: string;
  /** Opens the matter; samples have none. */
  href?: string;
}

const REFERENCE_COLUMN: DataTableColumn<MatterListItem> = {
  id: "reference",
  header: "رقم الملف",
  cell: (row) => <span dir="ltr">{row.reference ?? "—"}</span>,
  numeric: true,
};

const COLUMNS: readonly DataTableColumn<MatterListItem>[] = [
  {
    id: "title",
    header: "العنوان",
    cell: (row) =>
      row.href ? (
        <Link href={row.href} className="font-medium text-foreground underline-offset-4 hover:underline">
          {row.title}
        </Link>
      ) : (
        <span className="font-medium">{row.title}</span>
      ),
  },
  { id: "client", header: "العميل", cell: (row) => row.client ?? "—" },
  { id: "area", header: "النوع", cell: (row) => row.practiceArea ?? "—" },
  { id: "status", header: "الحالة", cell: (row) => <StatusBadge status={row.status} /> },
  { id: "updated", header: "آخر تحديث", cell: (row) => formatDate(row.updatedAt), numeric: true },
];

const STATUS_FILTERS: { value: MatterStatus | "all"; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "active", label: "قائمة" },
  { value: "on_hold", label: "معلّقة" },
  { value: "closed", label: "مغلقة" },
];

export function MattersTable({ matters, emptyAction }: { matters: readonly MatterListItem[]; emptyAction?: ReactNode }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MatterStatus | "all">("all");

  const rows = useMemo(() => {
    const q = query.trim();
    return matters.filter(
      (m) =>
        (status === "all" || m.status === status) &&
        (!q ||
          m.title.includes(q) ||
          (m.client ?? "").includes(q) ||
          (m.practiceArea ?? "").includes(q) ||
          (m.reference ?? "").toLowerCase().includes(q.toLowerCase())),
    );
  }, [matters, query, status]);
  const columns = matters.some((m) => m.reference) ? [REFERENCE_COLUMN, ...COLUMNS] : COLUMNS;

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-xs">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالعنوان أو العميل أو النوع"
            aria-label="بحث في الملفات"
            className="ps-9"
          />
        </div>
        <div role="radiogroup" aria-label="تصفية حسب الحالة" className="flex flex-wrap gap-1 rounded-md border border-border bg-surface-muted p-1">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="radio"
              aria-checked={status === filter.value}
              onClick={() => setStatus(filter.value)}
              className={
                status === filter.value
                  ? "rounded-sm bg-surface px-3 py-1 text-xs font-semibold text-foreground shadow-sm"
                  : "rounded-sm px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      <DataTable
        caption="قائمة الملفات"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        emptyTitle={matters.length === 0 ? "لا توجد ملفات بعد" : "لا توجد ملفات مطابقة"}
        emptyDescription={matters.length === 0 ? "أنشئ ملفًا لرفع مستنداته وتشغيل الأدوات عليه." : "جرّب تعديل البحث أو عامل التصفية."}
        emptyAction={matters.length === 0 ? emptyAction : undefined}
      />
    </Card>
  );
}
