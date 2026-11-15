import type { PostgrestError } from "@supabase/supabase-js";

export type DataErrorCode =
  | "invalid_input"
  | "not_found"
  | "forbidden"
  | "conflict"
  | "storage_error"
  | "database_error"
  /** The AI or transcription provider failed or is not configured. */
  | "ai_error";

export interface DataError {
  code: DataErrorCode;
  /** Safe to show to the user (Arabic). */
  message: string;
}

export type DataResult<T> = { ok: true; data: T } | { ok: false; error: DataError };

export function ok<T>(data: T): DataResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(code: DataErrorCode, message: string): DataResult<T> {
  return { ok: false, error: { code, message } };
}

/** HTTP status for a data error, for route handlers. */
export function httpStatus(code: DataErrorCode): number {
  switch (code) {
    case "invalid_input":
      return 400;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "conflict":
      return 409;
    case "ai_error":
      return 502;
    default:
      return 500;
  }
}

/**
 * Maps a Postgres/PostgREST error to a user-safe error. Internals are logged
 * on the server and never returned to the client.
 */
export function fromPostgrest<T = never>(error: PostgrestError, context: string): DataResult<T> {
  console.error(`[data] ${context}:`, error.code, error.message);
  switch (error.code) {
    case "42501": // insufficient_privilege, including RLS violations on write
      return fail("forbidden", "لا تملك صلاحية تنفيذ هذا الإجراء.");
    case "23505":
      return fail("conflict", "يوجد سجل مطابق بالفعل.");
    case "23514":
    case "22P02":
    case "23502":
      return fail("invalid_input", "البيانات المُدخلة غير صالحة.");
    case "PGRST116":
      return fail("not_found", "العنصر غير موجود.");
    default:
      return fail("database_error", "تعذّر إكمال العملية. حاول مرة أخرى.");
  }
}
