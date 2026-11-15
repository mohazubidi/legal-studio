"use client";

import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { Dialog, DialogDescription, DialogTitle, SheetContent } from "@/components/ui/dialog";
import type { SourceLink } from "@/lib/tools/shared/source-links";
import { Interpretation, ProvenanceTag } from "./parts";

export interface SourceSheetItem {
  kindLabel: string;
  title: string;
  /** Extracted text. */
  detail?: string | null;
  /** AI interpretation, shown separately from the extracted text. */
  interpretation?: string | null;
  referenced: boolean;
  /** Extra lines such as "البند 7.2" or a responsible party. */
  meta?: { label: string; value: string }[];
}

interface SourceSheetProps {
  item: SourceSheetItem | null;
  links: SourceLink[];
  onClose: () => void;
  /** Sample data has no real files to open. */
  linksEnabled: boolean;
  /** Extra content under the sources, e.g. review marks. */
  footer?: ReactNode;
}

/** Side panel showing the source behind an item: document, page/section and the supporting excerpt. */
export function SourceSheet({ item, links, onClose, linksEnabled, footer }: SourceSheetProps) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="end" className="w-[440px] overflow-y-auto">
        {item ? (
          <div className="space-y-4 p-5 pt-12">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">{item.kindLabel}</p>
              <DialogTitle className="mt-1 text-base font-semibold leading-7">{item.title}</DialogTitle>
              <div className="mt-2">
                <ProvenanceTag referenced={item.referenced} />
              </div>
            </div>
            {item.detail ? (
              <DialogDescription className="text-sm leading-7 text-foreground">{item.detail}</DialogDescription>
            ) : (
              <DialogDescription className="sr-only">تفاصيل المصدر</DialogDescription>
            )}
            {item.meta && item.meta.length > 0 ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                {item.meta.map((row) => (
                  <div key={row.label} className="contents">
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {item.interpretation ? <Interpretation>{item.interpretation}</Interpretation> : null}

            <section aria-labelledby="sources-heading">
              <h3 id="sources-heading" className="mb-2 text-sm font-semibold">
                المصادر الداعمة
              </h3>
              {links.length === 0 ? (
                <p role="note" className="rounded-md border border-verify/30 bg-verify-soft px-3 py-2 text-sm leading-6 text-verify">
                  لم يُتحقق من أي مصدر لهذا العنصر. لا تُنسب إليه إحالة، ويجب مراجعته يدويًا قبل الاعتماد عليه.
                </p>
              ) : (
                <ol className="space-y-3">
                  {links.map((link) => (
                    <li key={link.referenceId} className="rounded-md border border-source/20 bg-source-soft/50 p-3">
                      <p className="text-xs font-semibold text-source">
                        [م{link.number}] <bdi>{link.documentName}</bdi>
                      </p>
                      <p className="tabular mb-2 text-xs text-muted-foreground">{link.location ?? "موضع غير محدد"}</p>
                      <blockquote className="border-s-2 border-source ps-2 font-serif text-[15px] leading-8">«{link.excerpt}»</blockquote>
                      {linksEnabled ? (
                        <a href={link.href} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                          <ExternalLink className="size-3" aria-hidden />
                          فتح المستند الأصلي
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Dialog>
  );
}
