import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div role="status" aria-label="جارٍ التحميل">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-8 h-7 w-64" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
      <span className="sr-only">جارٍ التحميل…</span>
    </div>
  );
}
