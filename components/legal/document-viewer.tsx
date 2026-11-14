import { FileText } from "lucide-react";
import { formatDate, formatFileSize } from "@/lib/utils";
import type { LegalDocument } from "@/types/legal";
import { StatusBadge } from "./status-badge";

interface DocumentViewerProps {
  document: LegalDocument;
  matterTitle?: string;
}

/**
 * Paper-style reader. Each paragraph exposes an anchor (`#p{page}-{n}`) that
 * SourceCitation links to; the targeted paragraph is highlighted via CSS :target.
 */
export function DocumentViewer({ document, matterTitle }: DocumentViewerProps) {
  const metadata: { label: string; value: string }[] = [
    { label: "نوع المستند", value: document.kind },
    { label: "الملف", value: matterTitle ?? "—" },
    { label: "تاريخ الرفع", value: formatDate(document.uploadedAt) },
    { label: "الحجم", value: formatFileSize(document.sizeBytes) },
    { label: "عدد الصفحات", value: String(document.pages.length) },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <section aria-label={`نص المستند: ${document.name}`} className="min-w-0 rounded-lg border border-border bg-surface-muted/60">
        <div className="flex items-center gap-2 border-b border-border bg-surface px-5 py-3">
          <FileText className="size-4 text-muted-foreground" aria-hidden />
          <h2 className="truncate text-sm font-semibold">{document.name}</h2>
        </div>
        <div className="space-y-6 p-4 sm:p-8">
          {document.pages.map((page) => (
            <article
              key={page.number}
              aria-label={`صفحة ${page.number}`}
              className="mx-auto max-w-[720px] rounded-sm border border-border bg-surface px-6 py-8 shadow-sm sm:px-12 sm:py-12"
            >
              <div className="space-y-4 font-serif text-[17px] leading-9 text-foreground">
                {page.paragraphs.map((paragraph) => (
                  <p key={paragraph.anchor} id={paragraph.anchor} data-anchor className="scroll-mt-24 rounded-sm px-2 transition-colors">
                    {paragraph.text}
                  </p>
                ))}
              </div>
              <p className="tabular mt-10 border-t border-border pt-3 text-center text-xs text-muted-foreground">
                صفحة {page.number} من {document.pages.length}
              </p>
            </article>
          ))}
        </div>
      </section>

      <aside aria-label="بيانات المستند" className="h-fit rounded-lg border border-border bg-surface lg:sticky lg:top-6">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">بيانات المستند</h2>
          <StatusBadge status={document.status} />
        </div>
        <dl className="divide-y divide-border">
          {metadata.map((entry) => (
            <div key={entry.label} className="flex justify-between gap-4 px-5 py-3 text-sm">
              <dt className="text-muted-foreground">{entry.label}</dt>
              <dd className="tabular text-end font-medium">{entry.value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
