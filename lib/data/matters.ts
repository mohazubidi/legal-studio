import "server-only";
import { DOCUMENTS_BUCKET } from "@/config/constants";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  firstIssue,
  matterCreateSchema,
  matterUpdateSchema,
  uuidSchema,
  type MatterCreateInput,
  type MatterUpdateInput,
} from "@/lib/validation/schemas";
import type { MatterRow } from "@/types/database";
import { fail, fromPostgrest, ok, type DataResult } from "./result";

/**
 * Matters visible to the current user (RLS limits this to their own).
 * Provisional intake matters are excluded unless asked for: they appear only
 * in Matter Intake until the brief is used to create the matter.
 */
export async function listMatters(
  supabase: AppSupabaseClient,
  options: { intake?: "exclude" | "only" } = {},
): Promise<DataResult<MatterRow[]>> {
  let query = supabase.from("matters").select("*").order("created_at", { ascending: false });
  query = options.intake === "only" ? query.eq("status", "intake") : query.neq("status", "intake");
  const { data, error } = await query;
  return error ? fromPostgrest(error, "listMatters") : ok(data);
}

export async function getMatter(supabase: AppSupabaseClient, matterId: string): Promise<DataResult<MatterRow>> {
  if (!uuidSchema.safeParse(matterId).success) return fail("not_found", "الملف غير موجود.");
  const { data, error } = await supabase.from("matters").select("*").eq("id", matterId).maybeSingle();
  if (error) return fromPostgrest(error, "getMatter");
  return data ? ok(data) : fail("not_found", "الملف غير موجود.");
}

/** user_id is not accepted from the caller: the database stamps it from the session. */
export async function createMatter(
  supabase: AppSupabaseClient,
  input: MatterCreateInput,
): Promise<DataResult<MatterRow>> {
  const parsed = matterCreateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", firstIssue(parsed.error));
  const { data, error } = await supabase.from("matters").insert(parsed.data).select("*").single();
  return error ? fromPostgrest(error, "createMatter") : ok(data);
}

/**
 * Creates a provisional intake matter. The only path that sets status 'intake';
 * the general create/update schemas reject it, and the database forbids
 * moving a matter back to intake.
 */
export async function createIntakeMatter(supabase: AppSupabaseClient, matterName: string): Promise<DataResult<MatterRow>> {
  const name = matterName.trim().slice(0, 200);
  if (!name) return fail("invalid_input", "اسم الاستقبال مطلوب.");
  const { data, error } = await supabase.from("matters").insert({ matter_name: name, status: "intake" }).select("*").single();
  return error ? fromPostgrest(error, "createIntakeMatter") : ok(data);
}

export async function updateMatter(
  supabase: AppSupabaseClient,
  matterId: string,
  input: MatterUpdateInput,
): Promise<DataResult<MatterRow>> {
  if (!uuidSchema.safeParse(matterId).success) return fail("not_found", "الملف غير موجود.");
  const parsed = matterUpdateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", firstIssue(parsed.error));
  const { data, error } = await supabase.from("matters").update(parsed.data).eq("id", matterId).select("*").maybeSingle();
  if (error) return fromPostgrest(error, "updateMatter");
  return data ? ok(data) : fail("not_found", "الملف غير موجود.");
}

/** Deletes the matter and, by cascade, its documents, outputs and references. Storage objects are removed first. */
export async function deleteMatter(supabase: AppSupabaseClient, matterId: string): Promise<DataResult<null>> {
  const matter = await getMatter(supabase, matterId);
  if (!matter.ok) return matter;

  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("matter_id", matterId);
  if (docsError) return fromPostgrest(docsError, "deleteMatter.documents");

  if (docs.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .remove(docs.map((doc) => doc.storage_path));
    if (storageError) {
      console.error("[data] deleteMatter.storage:", storageError.message);
      return fail("storage_error", "تعذّر حذف ملفات المستندات. لم يُحذف الملف.");
    }
  }

  const { error } = await supabase.from("matters").delete().eq("id", matterId);
  return error ? fromPostgrest(error, "deleteMatter") : ok(null);
}
