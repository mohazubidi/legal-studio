import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ToolDefinition } from "@/types/legal";
import { StatusBadge } from "./status-badge";

export function ToolCard({ tool }: { tool: ToolDefinition }) {
  const Icon = tool.icon;
  return (
    <Link
      href={`/tools/${tool.id}`}
      className="group flex h-full flex-col rounded-lg border border-border bg-surface p-5 transition-colors duration-150 hover:border-border-strong hover:bg-surface-muted/40"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-muted text-primary">
          <Icon className="size-5" aria-hidden />
        </div>
        <StatusBadge status={tool.status} />
      </div>
      <h3 className="text-base font-semibold text-foreground">{tool.nameAr}</h3>
      <p lang="en" className="mt-0.5 text-xs font-medium tracking-wide text-muted-foreground">
        {tool.nameEn}
      </p>
      <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{tool.descriptionAr}</p>
      <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
        فتح مساحة الأداة
        <ArrowLeft className="size-4 transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
