import { ShieldAlert } from "lucide-react";
import { LEGAL_DISCLAIMER } from "@/config/constants";

/** Persistent, non-dismissible professional-responsibility notice. */
export function DisclaimerBar() {
  return (
    <div role="note" aria-label="تنبيه مهني" className="border-t border-border bg-accent-soft/70">
      <p className="flex items-start gap-2 px-4 py-2 text-xs leading-5 text-foreground lg:px-8">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        {LEGAL_DISCLAIMER}
      </p>
    </div>
  );
}
