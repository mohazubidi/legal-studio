"use client";

import { useId, useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitIntakeFormAction } from "@/app/(workspace)/tools/matter-intake/actions";
import { ActionMessage } from "@/components/tools/shared/action-message";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLIENT_TYPE_LABELS, CLIENT_TYPES, INTAKE_QUESTIONS, intakeFormSchema, type IntakeFormInput } from "@/lib/tools/matter-intake/form";

/**
 * Guided intake form. Validated in the browser for quick feedback and again
 * on the server, where the answers are stored verbatim.
 */
export function IntakeForm({ matterId, submitted }: { matterId: string; submitted: boolean }) {
  const id = useId();
  const [values, setValues] = useState<Record<string, string>>({ client_type: "individual" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);

  function submit() {
    setMessage(null);
    const parsed = intakeFormSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const result = await submitIntakeFormAction(matterId, values as IntakeFormInput);
      setMessage(result.ok ? { text: "حُفظت الإجابات كما كتبها العميل.", tone: "success" } : { text: result.message, tone: "error" });
    });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      noValidate
      className="space-y-4"
    >
      {submitted ? (
        <p role="status" className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          حُفظت إجابات النموذج. إرسال النموذج مرة أخرى يستبدل الإجابات السابقة.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {INTAKE_QUESTIONS.map((q) => {
          const fieldId = `${id}-${q.key}`;
          const error = errors[q.key];
          const required = q.key === "client_name" || q.key === "description";
          return (
            <div key={q.key} className={q.multiline ? "space-y-1.5 md:col-span-2" : "space-y-1.5"}>
              <Label htmlFor={fieldId}>
                {q.label}
                {required ? <span className="text-danger"> *</span> : null}
              </Label>
              {q.key === "client_type" ? (
                <select
                  id={fieldId}
                  value={values.client_type}
                  onChange={(e) => setValues((v) => ({ ...v, client_type: e.target.value }))}
                  className="block h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm"
                >
                  {CLIENT_TYPES.map((type) => (
                    <option key={type} value={type}>{CLIENT_TYPE_LABELS[type]}</option>
                  ))}
                </select>
              ) : q.multiline ? (
                <Textarea id={fieldId} rows={q.key === "description" ? 5 : 2} value={values[q.key] ?? ""} aria-invalid={Boolean(error)} aria-describedby={error ? `${fieldId}-error` : undefined} onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))} />
              ) : (
                <Input id={fieldId} value={values[q.key] ?? ""} aria-invalid={Boolean(error)} aria-describedby={error ? `${fieldId}-error` : undefined} onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))} />
              )}
              {q.hint ? <p className="text-xs text-muted-foreground">{q.hint}</p> : null}
              {error ? (
                <p id={`${fieldId}-error`} className="text-xs text-danger">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">اترك ما لا يعرفه العميل فارغًا؛ سيُسجَّل «لم تُقدَّم إجابة» ولن يُملأ تلقائيًا.</p>
      <ActionMessage message={message?.text ?? null} tone={message?.tone ?? "success"} />
      <Button type="submit" disabled={pending} aria-busy={pending || undefined}>
        {pending ? "جارٍ الحفظ…" : message?.tone === "error" ? "إعادة المحاولة" : submitted ? "تحديث الإجابات" : "حفظ إجابات النموذج"}
      </Button>
    </form>
  );
}
