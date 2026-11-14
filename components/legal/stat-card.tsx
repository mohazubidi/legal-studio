import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number;
  hint?: string;
  icon: LucideIcon;
}

export function StatCard({ label, value, hint, icon: Icon }: StatCardProps) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-border bg-surface p-5">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="tabular mt-2 text-2xl font-semibold text-foreground">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Icon className="size-5 text-muted-foreground" aria-hidden />
    </div>
  );
}
