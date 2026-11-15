import "server-only";
import { NextResponse } from "next/server";
import { httpStatus, type DataError } from "@/lib/data/result";
import { requireUser, type AppSupabaseClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export function apiError(status: number, code: string, message: string): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function dataError(error: DataError): NextResponse<ApiErrorBody> {
  return apiError(httpStatus(error.code), error.code, error.message);
}

/** Resolves the caller or returns the 401/503 response to send instead. */
export async function authorize(): Promise<
  { ok: true; supabase: AppSupabaseClient; user: User } | { ok: false; response: NextResponse<ApiErrorBody> }
> {
  const auth = await requireUser();
  if (auth.ok) return auth;
  return {
    ok: false,
    response:
      auth.reason === "unconfigured"
        ? apiError(503, "unconfigured", "الخادم غير مهيأ: إعدادات Supabase مفقودة.")
        : apiError(401, "unauthenticated", "يجب تسجيل الدخول."),
  };
}
