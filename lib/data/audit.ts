import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";
import type { AuditLogRow } from "@/types/database";
import { fail, fromPostgrest, ok, type DataResult } from "./result";

/**
 * The current user's audit trail, newest first. Writes to matters, documents
 * and outputs are recorded by database triggers; the app does not write them.
 */
export async function listAuditLogs(
  supabase: AppSupabaseClient,
  options: { matterId?: string; limit?: number } = {},
): Promise<DataResult<AuditLogRow[]>> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
  if (options.matterId) {
    if (!uuidSchema.safeParse(options.matterId).success) return fail("not_found", "الملف غير موجود.");
    query = query.eq("matter_id", options.matterId);
  }
  const { data, error } = await query;
  return error ? fromPostgrest(error, "listAuditLogs") : ok(data);
}
