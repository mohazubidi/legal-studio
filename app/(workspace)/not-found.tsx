import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/legal/empty-state";
import { Button } from "@/components/ui/button";

export default function WorkspaceNotFound() {
  return (
    <EmptyState
      icon={FileQuestion}
      title="العنصر غير موجود"
      description="ربما حُذف أو أن الرابط غير صحيح."
      action={
        <Button asChild variant="secondary">
          <Link href="/">العودة إلى لوحة التحكم</Link>
        </Button>
      }
    />
  );
}
