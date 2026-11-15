import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import {
  firstIssue,
  outputCreateSchema,
  outputStatusSchema,
  uuidSchema,
  type OutputCreateInput,
} from "@/lib/validation/schemas";
import type { Json, OutputRow, OutputStatus, SourceReferenceRow } from "@/types/database";
import { getMatter } from "./matters";
import { fail, fromPostgrest, ok, type DataResult } from "./result";

export type OutputWithReferences = OutputRow & { source_references: SourceReferenceRow[] };

export async function listOutputs(supabase: AppSupabaseClient, matterId: string): Promise<DataResult<OutputRow[]>> {
  if (!uuidSchema.safeParse(matterId).success) return fail("not_found", "الملف غير موجود.");
  const { data, error } = await supabase
    .from("outputs")
    .select("*")
    .eq("matter_id", matterId)
    .order("created_at", { ascending: false });
  return error ? fromPostgrest(error, "listOutputs") : ok(data);
}

export async function getOutput(
  supabase: AppSupabaseClient,
  outputId: string,
): Promise<DataResult<OutputWithReferences>> {
  if (!uuidSchema.safeParse(outputId).success) return fail("not_found", "المخرج غير موجود.");
  const { data, error } = await supabase
    .from("outputs")
    .select("*, source_references(*)")
    .eq("id", outputId)
    .maybeSingle();
  if (error) return fromPostgrest(error, "getOutput");
  return data ? ok(data) : fail("not_found", "المخرج غير موجود.");
}

/**
 * Persists a tool output and its source references. Tools are not implemented
 * yet; this is the storage contract they will use. References may only cite
 * documents of the same matter (enforced by RLS on source_references).
 */
export async function createOutput(
  supabase: AppSupabaseClient,
  matterId: string,
  input: OutputCreateInput,
): Promise<DataResult<OutputWithReferences>> {
  const parsed = outputCreateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", firstIssue(parsed.error));
  const matter = await getMatter(supabase, matterId);
  if (!matter.ok) return matter;

  const { references, ...output } = parsed.data;
  const { data: created, error } = await supabase
    .from("outputs")
    .insert({ ...output, content: output.content as Json, matter_id: matterId })
    .select("*")
    .single();
  if (error) return fromPostgrest(error, "createOutput");

  if (references.length === 0) return ok({ ...created, source_references: [] });

  const { data: refs, error: refsError } = await supabase
    .from("source_references")
    .insert(references.map((ref) => ({ ...ref, output_id: created.id })))
    .select("*");
  if (refsError) {
    // Keep outputs and their citations consistent: drop the output if any reference is rejected.
    await supabase.from("outputs").delete().eq("id", created.id);
    return fromPostgrest(refsError, "createOutput.references");
  }
  return ok({ ...created, source_references: refs });
}

export async function updateOutputStatus(
  supabase: AppSupabaseClient,
  outputId: string,
  status: OutputStatus,
): Promise<DataResult<OutputRow>> {
  if (!uuidSchema.safeParse(outputId).success) return fail("not_found", "المخرج غير موجود.");
  if (!outputStatusSchema.safeParse(status).success) return fail("invalid_input", "حالة غير صالحة.");
  const { data, error } = await supabase.from("outputs").update({ status }).eq("id", outputId).select("*").maybeSingle();
  if (error) return fromPostgrest(error, "updateOutputStatus");
  return data ? ok(data) : fail("not_found", "المخرج غير موجود.");
}
