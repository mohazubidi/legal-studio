import { LIBRARY_STATUS_LABELS } from "@/lib/library/format";
import { cn } from "@/lib/utils";
import type { LibraryLawStatus } from "@/types/database";

const STYLES: Record<LibraryLawStatus, string> = {
  in_force: "border-success/30 bg-success-soft text-success",
  repealed: "border-danger/30 bg-danger-soft text-danger",
  unknown: "border-border bg-surface-muted text-muted-foreground",
};

export function LawStatus({ status, className }: { status: LibraryLawStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-medium", STYLES[status], className)}>
      {LIBRARY_STATUS_LABELS[status]}
    </span>
  );
}

/** Shown wherever library text is displayed: it is a copy, the official source governs. */
export function LibraryNotice() {
  return (
    <p className="rounded-md border border-missing/30 bg-missing-soft px-3 py-2 text-sm leading-6 text-missing">
      نصوص المكتبة منسوخة من المصدر الرسمي في تاريخ الجلب الظاهر مع كل نظام، وقد تكون عُدّلت بعده. تحقّق من النسخة الرسمية قبل الاعتماد على أي نص.
    </p>
  );
}
