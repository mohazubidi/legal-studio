import { PROVENANCE } from "@/config/provenance";
import { cn } from "@/lib/utils";
import type { StatusVariant } from "@/types/legal";

interface BadgeStyle {
  label: string;
  className: string;
}

const STATUS_STYLES: Record<StatusVariant, BadgeStyle> = {
  draft: { label: "مسودة", className: "bg-surface-muted text-muted-foreground border-border-strong" },
  in_review: { label: "بانتظار المراجعة", className: "bg-missing-soft text-missing border-missing/30" },
  reviewed: { label: "تمت المراجعة", className: "bg-success-soft text-success border-success/30" },
  active: { label: "قائمة", className: "bg-source-soft text-source border-source/30" },
  on_hold: { label: "معلّقة", className: "bg-surface-muted text-muted-foreground border-border-strong" },
  closed: { label: "مغلقة", className: "bg-surface-muted text-muted-foreground border-border" },
  available: { label: "متاحة", className: "bg-success-soft text-success border-success/30" },
  coming_soon: { label: "قريبًا · Coming soon", className: "bg-accent-soft text-foreground border-accent/40" },
  processing: { label: "قيد المعالجة", className: "bg-surface-muted text-muted-foreground border-border-strong" },
  failed: { label: "تعذّرت المعالجة", className: "bg-danger-soft text-danger border-danger/30" },
  source: { label: PROVENANCE.source.labelAr, className: "bg-source-soft text-source border-source/30" },
  analysis: { label: PROVENANCE.analysis.labelAr, className: "bg-analysis-soft text-analysis border-analysis/30" },
  missing: { label: PROVENANCE.missing.labelAr, className: "bg-missing-soft text-missing border-missing/30" },
  verify: { label: PROVENANCE.verify.labelAr, className: "bg-verify-soft text-verify border-verify/30" },
};

interface StatusBadgeProps {
  status: StatusVariant;
  /** Override the default label (e.g. a shorter form in dense tables). */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const style = STATUS_STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center whitespace-nowrap rounded-sm border px-2 text-xs font-medium",
        style.className,
        className,
      )}
    >
      {label ?? style.label}
    </span>
  );
}
