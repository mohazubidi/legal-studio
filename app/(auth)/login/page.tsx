import type { Metadata } from "next";
import Link from "next/link";
import { AuthNotConfigured } from "@/components/auth/auth-not-configured";
import { LoginForm } from "@/components/auth/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "تسجيل الدخول" };

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <>
      <h1 className="text-2xl font-semibold">تسجيل الدخول</h1>
      <p className="mt-2 mb-8 text-sm text-muted-foreground">ادخل إلى مساحة العمل القانونية.</p>
      {configured ? null : <AuthNotConfigured />}
      {error === "callback" ? (
        <p role="alert" className="mb-4 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          انتهت صلاحية رابط التأكيد أو أنه غير صالح. حاول مرة أخرى.
        </p>
      ) : null}
      <LoginForm next={next ?? "/"} disabled={!configured} />
      <p className="mt-6 text-sm text-muted-foreground">
        ليس لديك حساب؟{" "}
        <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
          إنشاء حساب
        </Link>
      </p>
    </>
  );
}
