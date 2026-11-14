"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** When set, the confirm button stays disabled until this statement is checked. */
  acknowledgement?: string;
  variant?: "default" | "destructive";
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "إلغاء",
  acknowledgement,
  variant = "default",
  onConfirm,
}: ConfirmDialogProps) {
  const checkboxId = useId();
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);

  const canConfirm = !pending && (!acknowledgement || acknowledged);

  function handleOpenChange(next: boolean) {
    if (!next) setAcknowledged(false);
    onOpenChange(next);
  }

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      handleOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent role="alertdialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{description}</div>
          </DialogDescription>
        </DialogHeader>

        {acknowledgement ? (
          <div className="flex items-start gap-3 rounded-md border border-border bg-surface-muted p-3">
            <Checkbox
              id={checkboxId}
              checked={acknowledged}
              onCheckedChange={(value) => setAcknowledged(value === true)}
              className="mt-0.5"
            />
            <Label htmlFor={checkboxId} className="leading-6">
              {acknowledgement}
            </Label>
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">{cancelLabel}</Button>
          </DialogClose>
          <Button
            variant={variant === "destructive" ? "destructive" : "primary"}
            disabled={!canConfirm}
            onClick={handleConfirm}
            aria-busy={pending || undefined}
          >
            {pending ? "جارٍ التنفيذ…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
