"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface AuthFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "fullName", string>>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOT_CONFIGURED: AuthFormState = {
  status: "error",
  message: "المصادقة غير مهيأة. أضف متغيرات Supabase إلى ملف ‎.env.local‎.",
};

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Only allow same-origin relative redirects to prevent open-redirects. */
function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = readString(formData, "email");
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";
  const next = safeNext(readString(formData, "next"));

  const fieldErrors: AuthFormState["fieldErrors"] = {};
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = "أدخل بريدًا إلكترونيًا صحيحًا.";
  if (!password) fieldErrors.password = "أدخل كلمة المرور.";
  if (Object.keys(fieldErrors).length > 0) return { status: "error", fieldErrors };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { status: "error", message: "تعذّر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور." };
  }

  redirect(next);
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const fullName = readString(formData, "fullName");
  const organization = readString(formData, "organization");
  const email = readString(formData, "email");
  const password = typeof formData.get("password") === "string" ? (formData.get("password") as string) : "";

  const fieldErrors: AuthFormState["fieldErrors"] = {};
  if (fullName.length < 2) fieldErrors.fullName = "أدخل الاسم الكامل.";
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = "أدخل بريدًا إلكترونيًا صحيحًا.";
  if (password.length < 8) fieldErrors.password = "يجب ألا تقل كلمة المرور عن ٨ أحرف.";
  if (Object.keys(fieldErrors).length > 0) return { status: "error", fieldErrors };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NOT_CONFIGURED;

  const headerList = await headers();
  const origin = headerList.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, organization: organization || null },
      emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
    },
  });

  if (error) {
    return { status: "error", message: "تعذّر إنشاء الحساب. قد يكون البريد مسجلًا مسبقًا أو كلمة المرور ضعيفة." };
  }

  // When email confirmation is disabled Supabase returns a session immediately.
  if (data.session) redirect("/");

  return {
    status: "success",
    message: "تم إنشاء الحساب. أرسلنا رابط تأكيد إلى بريدك الإلكتروني؛ افتحه ثم سجّل الدخول.",
  };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/login");
}
