import { cn } from "@/lib/utils";

/** Inline result line for an action: error (role=alert) or confirmation (role=status). */
export function ActionMessage({ message, tone }: { message: string | null; tone: "error" | "success" }) {
  if (!message) return null;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-success/30 bg-success-soft text-success",
      )}
    >
      {message}
    </p>
  );
}
