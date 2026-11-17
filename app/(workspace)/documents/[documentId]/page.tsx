import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download } from "lucide-react";
import { DocumentViewer } from "@/components/legal/document-viewer";
import { ErrorState } from "@/components/legal/empty-state";
import { FileName } from "@/components/legal/file-name";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { Button } from "@/components/ui/button";
import { getDocument as getSampleDocument, getMatter as getSampleMatter } from "@/data/mock";
import { getDocument, parseSegments } from "@/lib/data/documents";
import { libraryFreshness } from "@/lib/data/library";
import { getMatter } from "@/lib/data/matters";
import { workspaceSource } from "@/lib/data/workspace";
import { SOURCE_KIND_LABELS } from "@/lib/tools/shared/labels";
import { formatDateTime, formatFileSize } from "@/lib/utils";

interface Props {
  params: Promise<{ documentId: string }>;
}

export const metadata: Metadata = { title: "مستند" };

export default async function DocumentPage({ params }: Props) {
  const { documentId } = await params;
  const source = await workspaceSource();

  if (source.kind === "preview") {
    const sample = getSampleDocument(documentId);
    if (!sample) notFound();
    return (
      <>
        <BackLink />
        <PageHeader titleEn="Document viewer" title={sample.name} />
        <DocumentViewer document={sample} matterTitle={getSampleMatter(sample.matterId)?.title} />
      </>
    );
  }

  const document = await getDocument(source.supabase, documentId);
  if (!document.ok) {
    if (document.error.code === "not_found") notFound();
    return <ErrorState title="تعذّر تحميل المستند" description={document.error.message} />;
  }
  const doc = document.data;
  const [matter, freshness] = await Promise.all([getMatter(source.supabase, doc.matter_id), libraryFreshness(source.supabase, [doc])]);
  const libraryState = freshness[doc.id];
  const segments = parseSegments(doc.segments);
  const canDownload = doc.processing_status !== "pending";

  const metadataRows = [
    { label: "النوع", value: SOURCE_KIND_LABELS[doc.source_kind] ?? doc.source_kind },
    { label: "الحجم", value: formatFileSize(doc.file_size_bytes) },
    { label: "تاريخ الرفع", value: formatDateTime(doc.created_at) },
    { label: "الأقسام المستخرجة", value: String(segments.length) },
  ];

  return (
    <>
      <BackLink />
      <PageHeader
        titleEn="Document viewer"
        title={<FileName name={doc.file_name} />}
        description={matter.ok ? matter.data.matter_name : undefined}
        actions={
          canDownload ? (
            <Button asChild variant="secondary">
              <a href={`/api/documents/${doc.id}/download`}>
                <Download aria-hidden />
                تنزيل الأصل
              </a>
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <section aria-label="النص المستخرج" className="min-w-0 rounded-lg border border-border bg-surface-muted/60">
          {doc.processing_status === "failed" ? (
            <div role="alert" className="m-4 rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-sm leading-6 text-danger">
              <span className="font-semibold">تعذّرت المعالجة: </span>
              {doc.processing_error ?? "خطأ غير معروف."}
            </div>
          ) : null}
          {segments.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              {doc.processing_status === "processed" ? "لا يحتوي المستند على نص مستخرج." : "لم يُستخرج النص بعد. عالج المصدر من صفحة الملف."}
            </p>
          ) : (
            <div className="space-y-4 p-4 sm:p-8">
              {segments.map((segment) => (
                <article key={segment.id} id={segment.id} aria-label={segment.label} className="mx-auto max-w-[720px] scroll-mt-24 rounded-sm border border-border bg-surface px-6 py-6 shadow-sm sm:px-10">
                  <p className="mb-3 text-xs font-semibold text-muted-foreground">{segment.label}</p>
                  <p className="whitespace-pre-line font-serif text-[17px] leading-9">{segment.text}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside aria-label="بيانات المستند" className="h-fit rounded-lg border border-border bg-surface lg:sticky lg:top-6">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold">بيانات المستند</h2>
            <StatusBadge status={doc.processing_status} />
          </div>
          <dl className="divide-y divide-border">
            {metadataRows.map((entry) => (
              <div key={entry.label} className="flex justify-between gap-4 px-5 py-3 text-sm">
                <dt className="text-muted-foreground">{entry.label}</dt>
                <dd className="font-medium">{entry.value}</dd>
              </div>
            ))}
          </dl>
          {libraryState ? (
            <div className="space-y-1 border-t border-border px-5 py-3 text-sm">
              <p className="text-muted-foreground">منسوخ من مكتبة الأنظمة.</p>
              {libraryState === "changed" ? <p className="text-verify">تغيّر نص النظام في المكتبة بعد النسخ، والنسخة هنا لم تتغير.</p> : null}
              {libraryState === "removed" ? <p className="text-verify">حُذف النظام من المكتبة بعد النسخ.</p> : null}
              {doc.library_law_id ? (
                <Link href={`/library/${doc.library_law_id}`} className="font-medium text-primary hover:underline">
                  فتح النظام في المكتبة
                </Link>
              ) : null}
            </div>
          ) : null}
          {matter.ok ? (
            <div className="border-t border-border px-5 py-3">
              <Link href={`/matters/${matter.data.id}`} className="text-sm font-medium text-primary hover:underline">
                فتح الملف
              </Link>
            </div>
          ) : null}
        </aside>
      </div>
    </>
  );
}

function BackLink() {
  return (
    <Link href="/documents" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowRight className="size-4" aria-hidden />
      المستندات
    </Link>
  );
}
