"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { ActionResult } from "@/app/(workspace)/tools/source-actions";
import { Button } from "@/components/ui/button";
import { ActionMessage } from "./action-message";
import type { GenerateContext } from "./tool-setup";

interface GenerateOutputProps {
  matterId: string;
  aiConfigured: boolean;
  processedCount: number;
  blockedReason: string | null;
  /** Part of the shared generate context; this button works on all processed sources and does not use it. */
  documents?: GenerateContext["documents"];
  /** Server action that generates and saves the output. */
  action: (matterId: string) => Promise<ActionResult<{ outputId: string }>>;
  /** The new output opens at `${outputPath}/${outputId}`. */
  outputPath: string;
  description: string;
  label: string;
}

/** Long-running AI generation with progress, failure and retry states. */
export function GenerateOutput({ matterId, aiConfigured, processedCount, blockedReason, action, outputPath, description, label }: GenerateOutputProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!aiConfigured) {
    return (
      <div role="status" className="rounded-md border border-missing/30 bg-missing-soft px-4 py-3 text-sm leading-6 text-missing">
        <p className="font-semibold">التحليل بالذكاء الاصطناعي غير متاح على هذا الخادم.</p>
        <p>
          يلزم ضبط <code dir="ltr">ANTHROPIC_API_KEY</code> في بيئة الخادم. يمكنك تجهيز المصادر ومعالجتها الآن، ثم التوليد بعد ضبط الإعداد.
        </p>
      </div>
    );
  }

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await action(matterId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`${outputPath}/${result.data.outputId}`);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      {blockedReason ? <p className="text-sm text-missing">{blockedReason}</p> : null}
      <ActionMessage message={error} tone="error" />
      <Button onClick={generate} disabled={pending || processedCount === 0 || blockedReason !== null} aria-busy={pending || undefined}>
        {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles aria-hidden />}
        {pending ? "جارٍ التحليل… قد يستغرق ذلك عدة دقائق" : error ? "إعادة المحاولة" : `${label} من ${processedCount} مصدر`}
      </Button>
    </div>
  );
}
