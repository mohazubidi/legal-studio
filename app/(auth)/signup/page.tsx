import type { Metadata } from "next";
import Link from "next/link";
import { AuthNotConfigured } from "@/components/auth/auth-not-configured";
import { SignupForm } from "@/components/auth/signup-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "إنشاء حساب" };

export default function SignupPage() {
  const configured = isSupabaseConfigured();
  return (
    <>
      <h1 className="text-2xl font-semibold">إنشاء حساب</h1>
      <p className="mt-2 mb-8 text-sm text-muted-foreground">أنشئ حسابًا للوصول إلى مساحة العمل.</p>
      {configured ? null : <AuthNotConfigured />}
      <SignupForm disabled={!configured} />
      <p className="mt-6 text-sm text-muted-foreground">
        لديك حساب؟{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </>
  );
}
