"use client";

import { useActionState } from "react";
import { signUp, type AuthFormState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { FormField } from "./form-field";
import { FormMessage } from "./form-message";

const INITIAL: AuthFormState = { status: "idle" };

export function SignupForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState(signUp, INITIAL);

  if (state.status === "success") return <FormMessage state={state} />;

  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <FormField label="الاسم الكامل" name="fullName" autoComplete="name" required disabled={disabled} error={state.fieldErrors?.fullName} />
      <FormField label="الجهة (اختياري)" name="organization" autoComplete="organization" disabled={disabled} />
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
        autoComplete="new-password"
        required
        minLength={8}
        hint="٨ أحرف على الأقل."
        disabled={disabled}
        error={state.fieldErrors?.password}
      />
      <Button type="submit" className="w-full" disabled={pending || disabled} aria-busy={pending || undefined}>
        {pending ? "جارٍ إنشاء الحساب…" : "إنشاء حساب"}
      </Button>
    </form>
  );
}
