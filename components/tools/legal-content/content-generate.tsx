"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { generateLegalContentAction } from "@/app/(workspace)/tools/legal-content/actions";
import { ActionMessage } from "@/components/tools/shared/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTENT_FORMATS, FORMAT_SPECS, type ContentFormat } from "@/lib/tools/legal-content/formats";
import { SOURCE_KIND_LABELS } from "@/lib/tools/shared/labels";
import { cn } from "@/lib/utils";
import type { SourceKind } from "@/types/database";

/** Kept in step with CONTENT_SOURCE_KINDS on the server (which re-checks). */
const ELIGIBLE = new Set(["legal_text", "article", "regulation_update", "lawyer_notes", "document", "pasted_text"]);

interface ContentGenerateProps {
  matterId: string;
  aiConfigured: boolean;
  defaultFirmName: string;
  documents: { id: string; file_name: string; processing_status: string; source_kind: string }[];
}

/** Choose the output type and the source material, then produce an editable draft. */
export function ContentGenerate({ matterId, aiConfigured, defaultFirmName, documents }: ContentGenerateProps) {
  const router = useRouter();
  const id = useId();
  const candidates = documents.filter((d) => ELIGIBLE.has(d.source_kind));
  const processed = candidates.filter((d) => d.processing_status === "processed");
  const [format, setFormat] = useState<ContentFormat>("carousel");
  // Track what the user unticked, so sources added later are selected by default.
  const [excluded, setExcluded] = useState<string[]>([]);
  const selected = processed.map((d) => d.id).filter((docId) => !excluded.includes(docId));
  const [firmName, setFirmName] = useState(defaultFirmName);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!aiConfigured) {
    return (
      <div role="status" className="rounded-md border border-missing/30 bg-missing-soft px-4 py-3 text-sm leading-6 text-missing">
        <p className="font-semibold">إعداد المحتوى غير متاح على هذا الخادم.</p>
        <p>
          يلزم ضبط <code dir="ltr">ANTHROPIC_API_KEY</code> في بيئة الخادم. يمكنك إضافة المصادر ومعالجتها الآن.
        </p>
      </div>
    );
  }

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateLegalContentAction(matterId, { format, documentIds: selected, firmName });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/tools/legal-content/${result.data.outputId}`);
    });
  }

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">نوع المحتوى</legend>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
          {CONTENT_FORMATS.map((f) => {
            const spec = FORMAT_SPECS[f];
            return (
              <label
                key={f}
                className={cn(
                  "cursor-pointer rounded-md border px-3 py-2 text-sm",
                  format === f ? "border-primary bg-surface-muted" : "border-border hover:border-border-strong",
                )}
              >
                <input type="radio" name={`${id}-format`} value={f} checked={format === f} onChange={() => setFormat(f)} className="sr-only" />
                <span className="block font-semibold">{spec.label}</span>
                <span className="block text-xs text-muted-foreground">{spec.description}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">المصادر</legend>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">أضف نصًا قانونيًا أو مقالًا أو تحديثًا تنظيميًا أو ملاحظات، أو ارفع مستندًا، في المرحلة 1.</p>
        ) : (
          <ul className="space-y-1.5">
            {candidates.map((doc) => {
              const ready = doc.processing_status === "processed";
              return (
                <li key={doc.id}>
                  <label className={cn("flex items-center gap-2 text-sm", !ready && "text-muted-foreground")}>
                    <input
                      type="checkbox"
                      checked={selected.includes(doc.id)}
                      disabled={!ready}
                      onChange={(e) => setExcluded((s) => (e.target.checked ? s.filter((x) => x !== doc.id) : [...s, doc.id]))}
                    />
                    <bdi className="truncate">{doc.file_name}</bdi>
                    <span className="text-xs text-muted-foreground">
                      {SOURCE_KIND_LABELS[doc.source_kind as SourceKind] ?? doc.source_kind}
                      {ready ? "" : " · غير معالج"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor={`${id}-firm`} className="text-sm font-medium">
          اسم المكتب على البطاقات
        </label>
        <Input id={`${id}-firm`} value={firmName} maxLength={80} onChange={(e) => setFirmName(e.target.value)} placeholder="مثال: مكتب … للمحاماة" />
      </div>

      <p className="text-sm leading-6 text-muted-foreground">
        يُعدّ المحتوى من المصادر المختارة وحدها. تُعرض النصوص المقتبسة كما وردت مع موضعها، ويُحذف أي رقم أو مادة أو نظام لا يرد في المصادر. يُحفظ الناتج كمسودة
        قابلة للتحرير.
      </p>
      <ActionMessage message={error} tone="error" />
      <Button onClick={generate} disabled={pending || selected.length === 0} aria-busy={pending || undefined}>
        {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles aria-hidden />}
        {pending ? "جارٍ إعداد المحتوى…" : error ? "إعادة المحاولة" : `إعداد ${FORMAT_SPECS[format].label}`}
      </Button>
    </div>
  );
}
