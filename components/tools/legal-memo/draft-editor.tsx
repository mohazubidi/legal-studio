"use client";

import { useId, useState, useTransition } from "react";
import { Loader2, Save, Sparkles } from "lucide-react";
import { generateDraftAction, saveDraftAction } from "@/app/(workspace)/tools/legal-memo/actions";
import { ConfirmDialog } from "@/components/legal/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import type { OutputStatus } from "@/types/database";
import { ActionMessage } from "@/components/tools/shared/action-message";

interface DraftEditorProps {
  outputId: string;
  status: OutputStatus;
  aiConfigured: boolean;
  draft: { text: string; generated_at: string; edited: boolean; updated_at: string } | null;
}

/** Stage 6: generate a first draft, then edit it. Saving an edit returns the memo to draft. */
export function DraftEditor({ outputId, status, aiConfigured, draft }: DraftEditorProps) {
  const textareaId = useId();
  const [text, setText] = useState(draft?.text ?? "");
  // When the stored draft changes (generated, regenerated or saved), start from the stored
  // text: stale local state would otherwise overwrite the new draft on the next save.
  const version = draft?.updated_at ?? null;
  const [syncedVersion, setSyncedVersion] = useState(version);
  if (version !== syncedVersion) {
    setSyncedVersion(version);
    setText(draft?.text ?? "");
  }
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"save" | "generate" | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const dirty = draft !== null && text !== draft.text;
  const reviewed = status !== "draft";

  function generate() {
    setBusy("generate");
    setMessage(null);
    startTransition(async () => {
      const result = await generateDraftAction(outputId);
      setBusy(null);
      if (!result.ok) {
        setMessage({ text: result.message, tone: "error" });
        return;
      }
      setMessage({ text: "أُنشئت المسودة. راجعها وعدّلها قبل إرسالها للمراجعة.", tone: "success" });
    });
  }

  function save() {
    setBusy("save");
    setMessage(null);
    startTransition(async () => {
      const result = await saveDraftAction(outputId, text);
      setBusy(null);
      setMessage(result.ok ? { text: "حُفظت التعديلات.", tone: "success" } : { text: result.message, tone: "error" });
    });
  }

  if (!draft) {
    return (
      <div className="space-y-3">
        <p className="text-sm leading-6 text-muted-foreground">
          تُكتب المسودة من المادة المنظمة أعلاه فقط، مع الإبقاء على أرقام الإحالات [م n]. لا تُضاف وقائع جديدة.
        </p>
        {aiConfigured ? null : (
          <p role="status" className="text-sm text-missing">
            توليد المسودة غير متاح: <code dir="ltr">ANTHROPIC_API_KEY</code> غير مضبوط على الخادم.
          </p>
        )}
        <ActionMessage message={message?.text ?? null} tone={message?.tone ?? "success"} />
        <Button onClick={generate} disabled={pending || !aiConfigured} aria-busy={busy === "generate" || undefined}>
          {busy === "generate" ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Sparkles aria-hidden />}
          {busy === "generate" ? "جارٍ كتابة المسودة…" : message?.tone === "error" ? "إعادة المحاولة" : "توليد المسودة الأولى"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        أُنشئت {formatDateTime(draft.generated_at)}
        {draft.edited ? ` · آخر تعديل بشري ${formatDateTime(draft.updated_at)}` : " · لم تُعدَّل بعد"}
      </p>
      {reviewed ? (
        <p role="status" className="rounded-md border border-missing/30 bg-missing-soft px-3 py-2 text-xs text-missing">
          حفظ أي تعديل يعيد المذكرة إلى حالة «مسودة» ويُلغي المراجعة أو الاعتماد الحالي.
        </p>
      ) : null}
      <label htmlFor={textareaId} className="sr-only">
        نص مسودة المذكرة
      </label>
      <Textarea
        id={textareaId}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={24}
        className="font-serif text-[15px] leading-8"
      />
      <ActionMessage message={message?.text ?? null} tone={message?.tone ?? "success"} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={pending || !dirty} aria-busy={busy === "save" || undefined}>
          <Save aria-hidden />
          {busy === "save" ? "جارٍ الحفظ…" : "حفظ التعديلات"}
        </Button>
        {dirty ? (
          <Button variant="ghost" onClick={() => setText(draft.text)} disabled={pending}>
            تجاهل التعديلات
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => setConfirmRegenerate(true)} disabled={pending || !aiConfigured}>
          <Sparkles aria-hidden />
          {busy === "generate" ? "جارٍ كتابة المسودة…" : "إعادة توليد المسودة"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title="إعادة توليد المسودة؟"
        description="ستُستبدل المسودة الحالية بما فيها تعديلاتك، وتعود المذكرة إلى حالة «مسودة»."
        confirmLabel="استبدال المسودة"
        variant="destructive"
        onConfirm={generate}
      />
    </div>
  );
}
