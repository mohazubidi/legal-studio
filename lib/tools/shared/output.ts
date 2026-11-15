import "server-only";
import { fail, fromPostgrest, ok, type DataResult } from "@/lib/data/result";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";
import type { Json, OutputRow, SourceReferenceRow, ToolType } from "@/types/database";
import type { VerifiedReference } from "./citations";

/**
 * Persists a tool output (always created as draft) and its verified
 * source_references. If any reference is rejected (RLS, cross-matter, …) the
 * output is removed, so content never points at missing references.
 */
export async function saveToolOutput(
  supabase: AppSupabaseClient,
  input: { matterId: string; toolType: ToolType; title: string; content: unknown; references: VerifiedReference[] },
): Promise<DataResult<{ outputId: string }>> {
  const { data: output, error: outputError } = await supabase
    .from("outputs")
    .insert({
      matter_id: input.matterId,
      tool_type: input.toolType,
      title: input.title.slice(0, 300),
      content: input.content as Json,
      status: "draft",
    })
    .select("id")
    .single();
  if (outputError) return fromPostgrest(outputError, "saveToolOutput.output");

  if (input.references.length > 0) {
    const { error: refsError } = await supabase
      .from("source_references")
      .insert(input.references.map((reference) => ({ ...reference, output_id: output.id })));
    if (refsError) {
      await supabase.from("outputs").delete().eq("id", output.id);
      return fromPostgrest(refsError, "saveToolOutput.references");
    }
  }
  return ok({ outputId: output.id });
}

/** Loads an output of a given tool with its references (content is validated by the caller). */
export async function getToolOutput(
  supabase: AppSupabaseClient,
  outputId: string,
  toolType: ToolType,
): Promise<DataResult<{ output: OutputRow; references: SourceReferenceRow[] }>> {
  if (!uuidSchema.safeParse(outputId).success) return fail("not_found", "المخرج غير موجود.");
  const { data, error } = await supabase
    .from("outputs")
    .select("*, source_references(*)")
    .eq("id", outputId)
    .eq("tool_type", toolType)
    .maybeSingle();
  if (error) return fromPostgrest(error, "getToolOutput");
  if (!data) return fail("not_found", "المخرج غير موجود.");
  const { source_references: references, ...output } = data;
  return ok({ output, references });
}

export async function listToolOutputs(
  supabase: AppSupabaseClient,
  matterId: string,
  toolType: ToolType,
): Promise<DataResult<OutputRow[]>> {
  if (!uuidSchema.safeParse(matterId).success) return fail("not_found", "الملف غير موجود.");
  const { data, error } = await supabase
    .from("outputs")
    .select("*")
    .eq("matter_id", matterId)
    .eq("tool_type", toolType)
    .order("created_at", { ascending: false });
  return error ? fromPostgrest(error, "listToolOutputs") : ok(data);
}
