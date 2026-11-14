import type { AuthFormState } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

export function FormMessage({ state }: { state: AuthFormState }) {
  if (!state.message) return null;
  const isError = state.status === "error";
  return (
    <p
      role={isError ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm leading-6",
        isError ? "border-danger/30 bg-danger-soft text-danger" : "border-success/30 bg-success-soft text-success",
      )}
    >
      {state.message}
    </p>
  );
}
