"use client";

import { ExternalLink } from "lucide-react";
import { Dialog, DialogDescription, DialogTitle, SheetContent } from "@/components/ui/dialog";
import type { CaseMapItemRef, SourceLink } from "@/lib/tools/casemap/explore";
import { Interpretation, ProvenanceTag } from "./parts";

const KIND_LABELS: Record<CaseMapItemRef["kind"], string> = {
  party: "طرف",
  claim: "مطالبة",
  position: "موقف طرف",
  event: "واقعة",
  evidence: "دليل",
  statement: "إفادة متعارضة",
  missing: "معلومة ناقصة",
};

interface SourceSheetProps {
  item: CaseMapItemRef | null;
  links: SourceLink[];
  onClose: () => void;
  /** Sample data has no real files to open. */
  linksEnabled: boolean;
}

/** Shows the source behind a clicked item: document, page/section and the supporting excerpt. */
export function SourceSheet({ item, links, onClose, linksEnabled }: SourceSheetProps) {
  return (
    <Dialog open={item !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="end" className="w-[440px] overflow-y-auto">
        {item ? (
          <div className="space-y-4 p-5 pt-12">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">{KIND_LABELS[item.kind]}</p>
              <DialogTitle className="mt-1 text-base font-semibold leading-7">{item.title}</DialogTitle>
              <div className="mt-2">
                <ProvenanceTag referenced={item.referenced} />
              </div>
            </div>
            {item.detail ? <DialogDescription className="text-sm leading-7 text-foreground">{item.detail}</DialogDescription> : <DialogDescription className="sr-only">تفاصيل المصدر</DialogDescription>}
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
          </div>
        ) : null}
      </SheetContent>
    </Dialog>
  );
}
