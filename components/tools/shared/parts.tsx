import type { ReactNode } from "react";
import { AlertTriangle, Bot, FileText } from "lucide-react";
import { UNREFERENCED_LABEL } from "@/lib/tools/shared/labels";
import type { SourceLink } from "@/lib/tools/shared/source-links";
import { cn } from "@/lib/utils";

/** Marks extraction vs. missing source. Colour is never the only cue: icon + text. */
export function ProvenanceTag({ referenced }: { referenced: boolean }) {
  return referenced ? (
    <span className="inline-flex items-center gap-1 rounded-sm border border-source/30 bg-source-soft px-1.5 py-0.5 text-[11px] font-medium text-source">
      <FileText className="size-3" aria-hidden />
      مستخرج من المصدر
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-sm border border-verify/30 bg-verify-soft px-1.5 py-0.5 text-[11px] font-medium text-verify">
      <AlertTriangle className="size-3" aria-hidden />
      {UNREFERENCED_LABEL}
    </span>
  );
}

/** AI interpretation, visually and textually separated from extracted facts. */
export function Interpretation({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-md border-s-[3px] border-analysis bg-analysis-soft px-3 py-2 text-sm leading-6", className)}>
      <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-analysis">
        <Bot className="size-3" aria-hidden />
        تفسير الذكاء الاصطناعي · ليس واقعة مستخرجة
      </p>
      {children}
    </div>
  );
}

/** Compact "م n · location" chips for an item's sources. */
export function SourceChips({ links }: { links: SourceLink[] }) {
  if (links.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {links.map((link) => (
        <span
          key={link.referenceId}
          className="tabular inline-flex h-5 items-center rounded-sm border border-source/30 bg-source-soft px-1.5 text-[11px] font-medium text-source"
        >
          {`م ${link.number}${link.location ? ` · ${link.location}` : ""}`}
        </span>
      ))}
    </span>
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border px-2.5 text-xs",
        tone === "accent" ? "border-accent/40 bg-accent-soft text-foreground" : "border-border bg-surface-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
