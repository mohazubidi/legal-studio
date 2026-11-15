"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { discardIntakeAction, startIntakeAction } from "@/app/(workspace)/tools/matter-intake/actions";
import { ConfirmDialog } from "@/components/legal/confirm-dialog";
import { ActionMessage } from "@/components/tools/shared/action-message";
import { Button } from "@/components/ui/button";

export function StartIntakeButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await startIntakeAction();
            if (!result.ok) setError(result.message);
            else router.push(`/tools/matter-intake/${result.data.matterId}`);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <Plus aria-hidden />}
        {pending ? "جارٍ البدء…" : error ? "إعادة المحاولة" : "بدء استقبال جديد"}
      </Button>
      <ActionMessage message={error} tone="error" />
    </div>
  );
}

export function DiscardIntakeButton({ matterId }: { matterId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden />
        إلغاء هذا الاستقبال
      </Button>
      <ActionMessage message={error} tone="error" />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="إلغاء الاستقبال"
        description="ستُحذف جميع المواد المرفوعة وإجابات النموذج والملخصات المرتبطة بهذا الاستقبال نهائيًا."
        confirmLabel="حذف نهائيًا"
        variant="destructive"
        onConfirm={async () => {
          const result = await discardIntakeAction(matterId);
          if (!result.ok) setError(result.message);
          else router.push("/tools/matter-intake");
        }}
      />
    </>
  );
}
