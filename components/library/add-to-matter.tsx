"use client";

import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { FolderPlus, Loader2 } from "lucide-react";
import { addLibrarySourceAction } from "@/app/(workspace)/library/actions";
import { ActionMessage } from "@/components/tools/shared/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeSearch } from "@/lib/library/format";
import { cn } from "@/lib/utils";

interface AddToMatterProps {
  lawId: string;
  lawTitle: string;
  repealed: boolean;
  articles: { position: number; label: string }[];
  matters: { id: string; name: string }[];
}

/** Copies the law, or chosen articles, into a matter as a citable source. */
export function AddToMatter({ lawId, lawTitle, repealed, articles, matters }: AddToMatterProps) {
  const id = useId();
  const [matterId, setMatterId] = useState(matters[0]?.id ?? "");
  const [scope, setScope] = useState<"all" | "some">("all");
  const [chosen, setChosen] = useState<number[]>([]);
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: true; matterId: string } | { ok: false; message: string } | null>(null);

  const visible = useMemo(() => {
    const term = normalizeSearch(filter);
    return term ? articles.filter((a) => normalizeSearch(a.label).includes(term)) : articles;
  }, [articles, filter]);

  if (matters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        لا توجد لديك قضايا بعد.{" "}
        <Link href="/matters/new" className="underline underline-offset-4">
          أنشئ ملفًا
        </Link>{" "}
        ثم أضف إليه هذا النظام.
      </p>
    );
  }

  function submit() {
    setResult(null);
    startTransition(async () => {
      const response = await addLibrarySourceAction({ matterId, lawId, positions: scope === "some" ? chosen : undefined });
      setResult(response.ok ? { ok: true, matterId: response.data.matterId } : { ok: false, message: response.message });
      if (response.ok) setChosen([]);
    });
  }

  const ready = Boolean(matterId) && (scope === "all" || chosen.length > 0);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={`${id}-matter`} className="text-sm font-medium">
          القضية
        </label>
        <select
          id={`${id}-matter`}
          value={matterId}
          onChange={(e) => setMatterId(e.target.value)}
          className="block h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
        >
          {matters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">ما يُضاف</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name={`${id}-scope`} checked={scope === "all"} onChange={() => setScope("all")} />
            النظام كاملًا ({articles.length} مادة)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`${id}-scope`} checked={scope === "some"} onChange={() => setScope("some")} />
            مواد محددة
          </label>
        </div>
      </fieldset>

      {scope === "some" ? (
        <div className="space-y-2">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="تصفية المواد بعنوانها" aria-label="تصفية المواد" />
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2" aria-label="المواد">
            {visible.map((a) => (
              <li key={a.position}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={chosen.includes(a.position)}
                    onChange={(e) => setChosen((s) => (e.target.checked ? [...s, a.position] : s.filter((p) => p !== a.position)))}
                  />
                  {a.label}
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            اخترت <span className="tabular">{chosen.length}</span> مادة.
          </p>
        </div>
      ) : null}

      {repealed ? (
        <p role="status" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          هذا النظام مسجّل في المصدر على أنه ملغى. تأكد من أن هذا ما تريد استخدامه.
        </p>
      ) : null}

      {result?.ok === false ? <ActionMessage message={result.message} tone="error" /> : null}
      {result?.ok ? (
        <p role="status" className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          أُضيف «{lawTitle}» إلى مصادر القضية.{" "}
          <Link href={`/matters/${result.matterId}`} className="font-medium underline underline-offset-4">
            فتح القضية
          </Link>
        </p>
      ) : null}

      <Button onClick={submit} disabled={pending || !ready} aria-busy={pending || undefined} className={cn(pending && "cursor-wait")}>
        {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <FolderPlus aria-hidden />}
        {pending ? "جارٍ الإضافة…" : "إضافة إلى القضية"}
      </Button>
    </div>
  );
}
