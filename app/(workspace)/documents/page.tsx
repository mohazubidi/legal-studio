import type { Metadata } from "next";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/legal/data-table";
import { FileName } from "@/components/legal/file-name";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DOCUMENTS, getMatter } from "@/data/mock";
import { listAllDocuments, workspaceSource } from "@/lib/data/workspace";
import { SOURCE_KIND_LABELS } from "@/lib/tools/shared/labels";
import { formatDate, formatFileSize } from "@/lib/utils";
import type { StatusVariant } from "@/types/legal";

export const metadata: Metadata = { title: "المستندات" };

interface DocumentItem {
  id: string;
  name: string;
  kind: string;
  matterLabel: string | null;
  matterHref?: string;
  sizeBytes: number;
  status: StatusVariant;
  error: string | null;
  uploadedAt: string;
}

const COLUMNS: readonly DataTableColumn<DocumentItem>[] = [
  {
    id: "name",
    header: "اسم المستند",
    cell: (row) => (
      <Link href={`/documents/${row.id}`} className="font-medium underline-offset-4 hover:underline">
        <FileName name={row.name} />
      </Link>
    ),
  },
  { id: "kind", header: "النوع", cell: (row) => row.kind },
  {
    id: "matter",
    header: "الملف",
    cell: (row) =>
      row.matterHref ? (
        <Link href={row.matterHref} className="underline-offset-4 hover:underline">
          {row.matterLabel}
        </Link>
      ) : (
        (row.matterLabel ?? "—")
      ),
  },
  { id: "size", header: "الحجم", cell: (row) => formatFileSize(row.sizeBytes), numeric: true },
  {
    id: "status",
    header: "الحالة",
    cell: (row) => (
      <span className="inline-flex flex-col items-start gap-1">
        <StatusBadge status={row.status} />
        {row.error ? <span className="max-w-56 text-xs text-danger">{row.error}</span> : null}
      </span>
    ),
  },
  { id: "date", header: "تاريخ الرفع", cell: (row) => formatDate(row.uploadedAt), numeric: true },
];

export default async function DocumentsPage() {
  const source = await workspaceSource();
  const stored = source.kind === "preview" ? null : await listAllDocuments(source.supabase);

  const rows: DocumentItem[] =
    stored === null
      ? DOCUMENTS.map((d) => ({ id: d.id, name: d.name, kind: d.kind, matterLabel: getMatter(d.matterId)?.title ?? null, sizeBytes: d.sizeBytes, status: d.status, error: null, uploadedAt: d.uploadedAt }))
      : stored.ok
        ? stored.data.map((d) => ({
            id: d.id,
            name: d.file_name,
            kind: SOURCE_KIND_LABELS[d.source_kind] ?? d.source_kind,
            matterLabel: d.matter?.matter_name ?? null,
            matterHref: d.matter ? `/matters/${d.matter.id}` : undefined,
            sizeBytes: d.file_size_bytes,
            status: d.processing_status,
            error: d.processing_status === "failed" ? d.processing_error : null,
            uploadedAt: d.created_at,
          }))
        : [];

  return (
    <>
      <PageHeader
        titleEn="Documents"
        title="المستندات"
        description="المستندات المرفوعة هي المصدر الوحيد الذي تستند إليه الأدوات في العناصر المصنفة «مستند إلى المصدر»."
      />

      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader className="block">
            <CardTitle>رفع مستندات</CardTitle>
            <CardDescription>كل مستند يتبع ملفًا، ولا يصل إليه إلا صاحب الملف.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm leading-6">
            افتح الملف من{" "}
            <Link href="/matters" className="font-medium text-primary underline-offset-4 hover:underline">
              القضايا والملفات
            </Link>{" "}
            وارفع مستنداته هناك، أو من داخل أي أداة.
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>مكتبة المستندات</CardTitle>
          </CardHeader>
          <DataTable
            caption="مكتبة المستندات"
            columns={COLUMNS}
            rows={rows}
            error={stored && !stored.ok ? stored.error.message : null}
            getRowId={(row) => row.id}
            emptyTitle="لم تُرفع مستندات بعد"
            emptyDescription="ارفع المستندات من صفحة الملف."
          />
        </Card>
      </div>
    </>
  );
}
