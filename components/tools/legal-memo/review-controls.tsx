"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { saveReviewNotesAction, transitionMemoAction } from "@/app/(workspace)/tools/legal-memo/actions";
import { ConfirmDialog } from "@/components/legal/confirm-dialog";
import { StatusBadge } from "@/components/legal/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APPROVAL_ACKNOWLEDGEMENT } from "@/config/constants";
import { canTransition, REVIEW_ACTION_LABELS } from "@/lib/tools/legal-memo/review";
import { formatDateTime } from "@/lib/utils";
import type { OutputStatus } from "@/types/database";
import { ActionMessage } from "./action-message";

interface ReviewControlsProps {
  outputId: string;
  status: OutputStatus;
  hasDraft: boolean;
  notes: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  openItems: { verify: number; missing: number };
}

const REVIEW_ACKNOWLEDGEMENT = "راجعتُ الوقائع والإحالات والمعلومات الناقصة والمسائل المقترحة";

const ORDER: OutputStatus[] = ["in_review", "reviewed", "approved", "draft"];

/**
 * Human review. Nothing is marked reviewed or approved except through these
 * explicit actions, each sign-off gated by an acknowledgement checkbox; the
 * database enforces the same transitions.
 */
export function ReviewControls({ outputId, status, hasDraft, notes, reviewedAt, approvedAt, openItems }: ReviewControlsProps) {
  const router = useRouter();
  const notesId = useId();
  const [value, setValue] = useState(notes ?? "");
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<OutputStatus | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);

  function saveNotes() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveReviewNotesAction(outputId, value);
      setMessage(result.ok ? { text: "حُفظت ملاحظات المراجعة.", tone: "success" } : { text: result.message, tone: "error" });
      router.refresh();
    });
  }

  async function transition(to: OutputStatus, acknowledged: boolean) {
    setMessage(null);
    const result = await transitionMemoAction(outputId, to, acknowledged);
    if (!result.ok) setMessage({ text: result.message, tone: "error" });
    router.refresh();
  }

  const actions = ORDER.filter((to) => canTransition(status, to)).filter((to) => to !== "in_review" || hasDraft);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">الحالة:</span>
        <StatusBadge status={status} />
        {reviewedAt ? <span className="text-xs text-muted-foreground">روجعت {formatDateTime(reviewedAt)}</span> : null}
        {approvedAt ? <span className="text-xs text-muted-foreground">· اعتُمدت {formatDateTime(approvedAt)}</span> : null}
      </div>

      {openItems.verify + openItems.missing > 0 ? (
        <p className="rounded-md border border-verify/30 bg-verify-soft px-3 py-2 text-xs leading-5 text-verify">
          قبل الاعتماد: {openItems.verify} عنصرًا يتطلب تحققًا بشريًا، و{openItems.missing} من المعلومات الناقصة أو غير الواضحة.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={notesId}>ملاحظات المراجعة</Label>
        <Textarea id={notesId} value={value} onChange={(e) => setValue(e.target.value)} rows={4} maxLength={10_000} />
        <Button variant="secondary" size="sm" onClick={saveNotes} disabled={pending || value === (notes ?? "")}>
          حفظ الملاحظات
        </Button>
      </div>

      <ActionMessage message={message?.text ?? null} tone={message?.tone ?? "success"} />

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        {!hasDraft ? <p className="text-xs text-muted-foreground">أنشئ المسودة لتتمكن من إرسالها للمراجعة.</p> : null}
        {actions.map((to) => (
          <Button
            key={to}
            variant={to === "approved" ? "primary" : to === "draft" ? "ghost" : "secondary"}
            disabled={pending}
            onClick={() => (to === "reviewed" || to === "approved" ? setConfirm(to) : startTransition(() => transition(to, false)))}
          >
            {REVIEW_ACTION_LABELS[to]}
          </Button>
        ))}
      </div>

      <ConfirmDialog
        open={confirm === "reviewed"}
        onOpenChange={(open) => setConfirm(open ? "reviewed" : null)}
        title="تأكيد مراجعة المذكرة"
        description="تأكيد المراجعة لا يعني الاعتماد. يبقى الاعتماد إجراءً منفصلًا."
        acknowledgement={REVIEW_ACKNOWLEDGEMENT}
        confirmLabel="تأكيد المراجعة"
        onConfirm={() => transition("reviewed", true)}
      />
      <ConfirmDialog
        open={confirm === "approved"}
        onOpenChange={(open) => setConfirm(open ? "approved" : null)}
        title="اعتماد المذكرة"
        description="الاعتماد إجراء مهني يُسجَّل باسمك ووقته. أي تعديل لاحق يعيد المذكرة إلى مسودة."
        acknowledgement={APPROVAL_ACKNOWLEDGEMENT}
        confirmLabel="اعتماد"
        onConfirm={() => transition("approved", true)}
      />
    </div>
  );
}
