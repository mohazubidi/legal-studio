"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createMatterAction } from "@/app/(workspace)/tools/source-actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionMessage } from "./action-message";

/** Creates a matter, then returns to `basePath?matter=<id>` (the tool that opened it). */
export function NewMatterForm({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createMatterAction({
        matter_name: String(formData.get("matter_name") ?? ""),
        matter_type: String(formData.get("matter_type") ?? ""),
        client_name: String(formData.get("client_name") ?? ""),
        description: String(formData.get("description") ?? ""),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`${basePath}?matter=${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="matter_name">اسم الملف *</Label>
          <Input id="matter_name" name="matter_name" required maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="client_name">العميل</Label>
          <Input id="client_name" name="client_name" maxLength={200} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="matter_type">نوع الملف</Label>
          <Input id="matter_type" name="matter_type" maxLength={100} placeholder="مثال: نزاع تجاري" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">وصف مختصر</Label>
        <Textarea id="description" name="description" maxLength={5000} rows={3} />
        <p className="text-xs text-muted-foreground">الوصف للتنظيم فقط، ولا يُعامل كمصدر للوقائع.</p>
      </div>
      <ActionMessage message={error} tone="error" />
      <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? "جارٍ الإنشاء…" : "إنشاء الملف"}
      </Button>
    </form>
  );
}
