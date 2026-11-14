"use client";

import { ErrorState } from "@/components/legal/empty-state";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      title="حدث خطأ غير متوقع"
      description="تعذّر عرض هذه الصفحة. يمكنك المحاولة مرة أخرى."
      action={<Button variant="secondary" onClick={reset}>إعادة المحاولة</Button>}
    />
  );
}
