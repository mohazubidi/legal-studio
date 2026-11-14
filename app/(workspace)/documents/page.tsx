import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/legal/data-table";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { UploadArea } from "@/components/legal/upload-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DOCUMENTS, getMatter } from "@/data/mock";
import { formatDate, formatFileSize } from "@/lib/utils";
import type { LegalDocument } from "@/types/legal";

export const metadata: Metadata = { title: "المستندات" };

const COLUMNS: readonly DataTableColumn<LegalDocument>[] = [
  {
    id: "name",
    header: "اسم المستند",
    cell: (row) => (
      <Link href={`/documents/${row.id}`} className="font-medium underline-offset-4 hover:underline">
        {row.name}
      </Link>
    ),
  },
  { id: "kind", header: "النوع", cell: (row) => row.kind },
  { id: "matter", header: "الملف", cell: (row) => getMatter(row.matterId)?.title ?? "—" },
  { id: "size", header: "الحجم", cell: (row) => formatFileSize(row.sizeBytes), numeric: true },
  { id: "status", header: "الحالة", cell: (row) => <StatusBadge status={row.status} /> },
  { id: "date", header: "تاريخ الرفع", cell: (row) => formatDate(row.uploadedAt), numeric: true },
];

export default function DocumentsPage() {
  return (
    <>
      <PageHeader
        titleEn="Documents"
        title="المستندات"
        description="المستندات المرفوعة هي المصدر الوحيد الذي تستند إليه الأدوات في العناصر المصنفة «مستند إلى المصدر»."
      />

      <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <Card className="h-fit">
          <CardHeader className="block">
            <CardTitle>رفع مستندات</CardTitle>
            <CardDescription>يُفعّل الحفظ في التخزين في المرحلة التالية.</CardDescription>
          </CardHeader>
          <CardContent>
            <UploadArea pendingNotice="لم يُحفظ الملف: التخزين غير مفعّل في هذه المرحلة." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>مكتبة المستندات</CardTitle>
          </CardHeader>
          <DataTable
            caption="مكتبة المستندات"
            columns={COLUMNS}
            rows={DOCUMENTS}
            getRowId={(row) => row.id}
            emptyTitle="لم تُرفع مستندات بعد"
          />
        </Card>
      </div>
    </>
  );
}
