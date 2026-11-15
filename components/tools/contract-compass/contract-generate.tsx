"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { generateContractAction } from "@/app/(workspace)/tools/contract-compass/actions";
import { ActionMessage } from "@/components/tools/shared/action-message";
import { Button } from "@/components/ui/button";

interface ContractGenerateProps {
  matterId: string;
  aiConfigured: boolean;
  documents: { id: string; file_name: string; processing_status: string; source_kind: string }[];
}

/** Picks the contract to analyse (one processed document) and runs the analysis. */
export function ContractGenerate({ matterId, aiConfigured, documents }: ContractGenerateProps) {
  const router = useRouter();
  const id = useId();
  const candidates = documents.filter((doc) => doc.source_kind === "document" || doc.source_kind === "pasted_text");
  const processed = candidates.filter((doc) => doc.processing_status === "processed");
  const [documentId, setDocumentId] = useState(processed[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!aiConfigured) {
    return (
      <div role="status" className="rounded-md border border-missing/30 bg-missing-soft px-4 py-3 text-sm leading-6 text-missing">
        <p className="font-semibold">تحليل العقود غير متاح على هذا الخادم.</p>
        <p>
          يلزم ضبط <code dir="ltr">ANTHROPIC_API_KEY</code> في بيئة الخادم. يمكنك رفع العقد ومعالجته الآن.
        </p>
      </div>
    );
  }

  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">ارفع العقد في المرحلة 1 ثم عالجه.</p>;
  }

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateContractAction(matterId, documentId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/tools/contract-compass/${result.data.outputId}`);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={`${id}-doc`} className="text-sm font-medium">
          العقد المراد تحليله
        </label>
        <select
          id={`${id}-doc`}
          value={documentId}
          onChange={(event) => setDocumentId(event.target.value)}
          className="block h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm"
        >
          {processed.length === 0 ? <option value="">لا يوجد مستند معالج</option> : null}
          {candidates.map((doc) => (
            <option key={doc.id} value={doc.id} disabled={doc.processing_status !== "processed"}>
              {doc.file_name}
              {doc.processing_status !== "processed" ? " (غير معالج)" : ""}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        يُحلَّل نص العقد وحده. كل بند ومبلغ وتاريخ يُعرض فقط إذا وُجد في النص المستشهد به، وتُصاغ الملاحظات بلغة مهنية غير قاطعة.
      </p>
      <ActionMessage message={error} tone="error" />
      <Button onClick={generate} disabled={pending || !documentId} aria-busy={pending || undefined}>
        {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles aria-hidden />}
        {pending ? "جارٍ تحليل العقد… قد يستغرق ذلك عدة دقائق" : error ? "إعادة المحاولة" : "تحليل العقد"}
      </Button>
    </div>
  );
}
