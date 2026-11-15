"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { generateRegDeltaAction } from "@/app/(workspace)/tools/regdelta/actions";
import { ActionMessage } from "@/components/tools/shared/action-message";
import { Button } from "@/components/ui/button";

interface Props {
  matterId: string;
  aiConfigured: boolean;
  documents: { id: string; file_name: string; processing_status: string; source_kind: string }[];
}

/** Picks Document A (previous version) and Document B (new version). */
export function RegDeltaGenerate({ matterId, aiConfigured, documents }: Props) {
  const router = useRouter();
  const id = useId();
  const candidates = documents.filter((doc) => doc.source_kind === "document" || doc.source_kind === "pasted_text");
  const processed = candidates.filter((doc) => doc.processing_status === "processed");
  const [previousId, setPreviousId] = useState(processed[0]?.id ?? "");
  const [nextId, setNextId] = useState(processed[1]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!aiConfigured) {
    return (
      <div role="status" className="rounded-md border border-missing/30 bg-missing-soft px-4 py-3 text-sm leading-6 text-missing">
        <p className="font-semibold">المقارنة غير متاحة على هذا الخادم.</p>
        <p>
          يلزم ضبط <code dir="ltr">ANTHROPIC_API_KEY</code>. يمكنك رفع النسختين ومعالجتهما الآن.
        </p>
      </div>
    );
  }
  if (processed.length < 2) {
    return <p className="text-sm text-muted-foreground">ارفع النسختين السابقة والجديدة في المرحلة 1 ثم عالجهما.</p>;
  }

  const same = previousId !== "" && previousId === nextId;
  const select = (label: string, value: string, onChange: (v: string) => void, key: string) => (
    <div className="flex-1 space-y-1.5">
      <label htmlFor={`${id}-${key}`} className="text-sm font-medium">{label}</label>
      <select id={`${id}-${key}`} value={value} onChange={(e) => onChange(e.target.value)} className="block h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm">
        {candidates.map((doc) => (
          <option key={doc.id} value={doc.id} disabled={doc.processing_status !== "processed"}>
            {doc.file_name}
            {doc.processing_status !== "processed" ? " (غير معالج)" : ""}
          </option>
        ))}
      </select>
    </div>
  );

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateRegDeltaAction(matterId, previousId, nextId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/tools/regdelta/${result.data.outputId}`);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3">
        {select("المستند (أ) — النسخة السابقة", previousId, setPreviousId, "prev")}
        <ArrowLeft className="mx-auto size-4 rotate-90 text-muted-foreground" aria-hidden />
        {select("المستند (ب) — النسخة الجديدة", nextId, setNextId, "next")}
      </div>
      {same ? <p role="alert" className="text-sm text-danger">اختر مستندين مختلفين.</p> : null}
      <p className="text-sm leading-6 text-muted-foreground">
        تُقسَّم النسختان إلى مواد وتُطابق آليًا، ثم يشرح الذكاء الاصطناعي التغييرات. لا يُبحث في أي مصدر خارجي، ولا يُفترض نفاذ أي من النسختين.
      </p>
      <ActionMessage message={error} tone="error" />
      <Button onClick={generate} disabled={pending || !previousId || !nextId || same} aria-busy={pending || undefined}>
        {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles aria-hidden />}
        {pending ? "جارٍ المقارنة… قد يستغرق ذلك عدة دقائق" : error ? "إعادة المحاولة" : "مقارنة النسختين"}
      </Button>
    </div>
  );
}
