"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { generateMemoAction } from "@/app/(workspace)/tools/legal-memo/actions";
import { Button } from "@/components/ui/button";
import { ActionMessage } from "./action-message";

interface GenerateMemoProps {
  matterId: string;
  aiConfigured: boolean;
  processedCount: number;
  blockedReason: string | null;
}

/** Stages 2–5. Long-running: shows progress, failure and retry. */
export function GenerateMemo({ matterId, aiConfigured, processedCount, blockedReason }: GenerateMemoProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!aiConfigured) {
    return (
      <div role="status" className="rounded-md border border-missing/30 bg-missing-soft px-4 py-3 text-sm leading-6 text-missing">
        <p className="font-semibold">التحليل بالذكاء الاصطناعي غير متاح على هذا الخادم.</p>
        <p>
          يلزم ضبط <code dir="ltr">ANTHROPIC_API_KEY</code> في بيئة الخادم. يمكنك تجهيز المصادر ومعالجتها الآن، ثم توليد المذكرة بعد ضبط الإعداد.
        </p>
      </div>
    );
  }

  const disabled = pending || processedCount === 0 || blockedReason !== null;

  function generate() {
    setError(null);
    startTransition(async () => {
      const result = await generateMemoAction(matterId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/tools/legal-memo/${result.data.outputId}`);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-muted-foreground">
        يستخرج الوقائع مع إحالاتها، ويحدد المعلومات الناقصة، ويقترح المسائل القانونية للمراجعة، ويبني هيكل المذكرة. يُحفظ الناتج كمسودة ولا يُعتمد إلا بإجراء صريح منك.
      </p>
      {blockedReason ? <p className="text-sm text-missing">{blockedReason}</p> : null}
      <ActionMessage message={error} tone="error" />
      <Button onClick={generate} disabled={disabled} aria-busy={pending || undefined}>
        {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles aria-hidden />}
        {pending ? "جارٍ التحليل… قد يستغرق ذلك عدة دقائق" : error ? "إعادة المحاولة" : `توليد تحليل المذكرة من ${processedCount} مصدر`}
      </Button>
    </div>
  );
}
