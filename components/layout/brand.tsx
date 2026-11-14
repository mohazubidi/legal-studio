import Link from "next/link";
import { Scale } from "lucide-react";
import { APP_NAME, APP_NAME_AR } from "@/config/constants";

export function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 rounded-md" aria-label={`${APP_NAME} — الصفحة الرئيسية`}>
      <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Scale className="size-5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span lang="en" className="block text-sm font-semibold tracking-wide text-foreground">
          {APP_NAME}
        </span>
        <span className="block text-xs text-muted-foreground">{APP_NAME_AR}</span>
      </span>
    </Link>
  );
}
