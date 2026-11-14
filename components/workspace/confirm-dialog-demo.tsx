"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/legal/confirm-dialog";
import { Button } from "@/components/ui/button";
import { APPROVAL_ACKNOWLEDGEMENT } from "@/config/constants";

export function ConfirmDialogDemo() {
  const [approveOpen, setApproveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button onClick={() => setApproveOpen(true)}>اعتماد مع إقرار</Button>
      <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
        حذف
      </Button>
      <p role="status" className="text-xs text-muted-foreground">
        {lastAction}
      </p>

      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title="اعتماد المخرج"
        description="لا يُفعّل زر الاعتماد إلا بعد الإقرار بالمراجعة."
        confirmLabel="اعتماد"
        acknowledgement={APPROVAL_ACKNOWLEDGEMENT}
        onConfirm={() => setLastAction("تم الاعتماد (مثال).")}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="حذف المستند"
        description="سيُحذف المستند وجميع الإحالات إليه. لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف نهائي"
        variant="destructive"
        onConfirm={() => setLastAction("تم الحذف (مثال).")}
      />
    </div>
  );
}
