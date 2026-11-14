"use client";

import { useActionState } from "react";
import { signIn, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FormField } from "./form-field";
import { FormMessage } from "./form-message";

const INITIAL: AuthFormState = { status: "idle" };

export function LoginForm({ next, disabled }: { next: string; disabled: boolean }) {
  const [state, action, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage state={state} />
      <FormField
        label="البريد الإلكتروني"
        name="email"
        type="email"
        dir="ltr"
        autoComplete="email"
        required
        disabled={disabled}
        error={state.fieldErrors?.email}
      />
      <FormField
        label="كلمة المرور"
        name="password"
        type="password"
        dir="ltr"
        autoComplete="current-password"
        required
        disabled={disabled}
        error={state.fieldErrors?.password}
      />
      <Button type="submit" className="w-full" disabled={pending || disabled} aria-busy={pending || undefined}>
        {pending ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}
      </Button>
    </form>
  );
}
