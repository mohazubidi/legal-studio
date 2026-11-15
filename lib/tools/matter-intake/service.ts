import "server-only";
import { randomUUID } from "node:crypto";
import type { StructuredAIProvider } from "@/lib/ai/provider";
import { createTextSource, deleteDocument, listDocuments } from "@/lib/data/documents";
import { createMatter, deleteMatter, getMatter } from "@/lib/data/matters";
import { fail, fromPostgrest, ok, type DataResult } from "@/lib/data/result";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { getToolOutput, saveToolOutput } from "@/lib/tools/shared/output";
import { indexSources, MAX_SOURCE_CHARS, totalSourceChars } from "@/lib/tools/shared/sources";
import { formatDateTime } from "@/lib/utils";
import type { Json, MatterRow, OutputRow, SourceReferenceRow } from "@/types/database";
import { parseIntakeContent, type IntakeContent } from "./content";
import { applyBriefEdits, briefEditsSchema, prepareMatterFromBrief, type BriefEdits, type FinalizeInput } from "./edits";
import { formatIntakeAnswers, intakeFormSchema, type IntakeFormInput } from "./form";
import { intakeBriefSchema } from "./model-schema";
import { buildIntakePrompt, INTAKE_SYSTEM_PROMPT } from "./prompt";
import { buildIntakeRecord } from "./record";

export interface IntakeOutputData {
  output: OutputRow;
  content: IntakeContent;
  references: SourceReferenceRow[];
}

/** Starts an intake: a provisional matter that holds the client's material until the brief is reviewed. */
export async function startIntake(supabase: AppSupabaseClient): Promise<DataResult<{ matterId: string }>> {
  const created = await createMatter(supabase, { matter_name: `استقبال جديد — ${formatDateTime(new Date().toISOString())}`, status: "intake" });
  return created.ok ? ok({ matterId: created.data.id }) : created;
}

async function requireIntakeMatter(supabase: AppSupabaseClient, matterId: string): Promise<DataResult<MatterRow>> {
  const matter = await getMatter(supabase, matterId);
  if (!matter.ok) return matter;
  if (matter.data.status !== "intake") return fail("conflict", "اكتمل استقبال هذا الملف وأُنشئ الملف بالفعل.");
  return matter;
}

/**
 * Stores the form answers verbatim as an `intake_form` source (replacing an
 * earlier submission), after server-side validation.
 */
export async function submitIntakeForm(supabase: AppSupabaseClient, matterId: string, input: IntakeFormInput): Promise<DataResult<null>> {
  const parsed = intakeFormSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", parsed.error.issues[0]?.message ?? "إجابات غير صالحة.");
  const matter = await requireIntakeMatter(supabase, matterId);
  if (!matter.ok) return matter;

  const existing = await listDocuments(supabase, matterId);
  if (!existing.ok) return existing;
  for (const doc of existing.data.filter((d) => d.source_kind === "intake_form")) {
    const removed = await deleteDocument(supabase, doc.id);
    if (!removed.ok) return removed;
  }
  const created = await createTextSource(supabase, matterId, { kind: "intake_form", title: "إجابات نموذج الاستقبال", text: formatIntakeAnswers(parsed.data) });
  return created.ok ? ok(null) : created;
}

/** Builds the Matter Brief from every processed source of the intake. */
export async function generateIntakeBrief(supabase: AppSupabaseClient, provider: StructuredAIProvider, matterId: string): Promise<DataResult<{ outputId: string }>> {
  const matter = await requireIntakeMatter(supabase, matterId);
  if (!matter.ok) return matter;
  const documents = await listDocuments(supabase, matterId);
  if (!documents.ok) return documents;
  const { sources, snapshot } = indexSources(documents.data);
  if (sources.length === 0) return fail("invalid_input", "أضف إجابات النموذج أو رواية العميل أو مستندًا معالجًا أولًا.");
  if (snapshot.some((s) => s.processing_status === "processing" || s.processing_status === "pending")) {
    return fail("conflict", "بعض المواد ما زالت قيد المعالجة. انتظر اكتمالها ثم أعد المحاولة.");
  }
  if (totalSourceChars(sources) > MAX_SOURCE_CHARS) return fail("invalid_input", "حجم مواد الاستقبال يتجاوز الحد المسموح. لن يُقتطع أي نص تلقائيًا.");

  const generated = await provider.generate({ system: INTAKE_SYSTEM_PROMPT, prompt: buildIntakePrompt(sources), schema: intakeBriefSchema });
  if (!generated.ok) return fail("ai_error", generated.error.message);

  const record = buildIntakeRecord({ output: generated.data, sources, snapshot, model: generated.model, now: new Date().toISOString(), newId: randomUUID });
  return saveToolOutput(supabase, { matterId, toolType: "matter_intake", title: "ملخص الاستقبال", content: record.content, references: record.references });
}

export async function getIntakeBrief(supabase: AppSupabaseClient, outputId: string): Promise<DataResult<IntakeOutputData>> {
  const loaded = await getToolOutput(supabase, outputId, "matter_intake");
  if (!loaded.ok) return loaded.error.code === "not_found" ? fail("not_found", "ملخص الاستقبال غير موجود.") : loaded;
  const content = parseIntakeContent(loaded.data.output.content);
  if (!content) return fail("database_error", "محتوى الملخص المحفوظ غير صالح ولا يمكن عرضه.");
  return ok({ output: loaded.data.output, content, references: loaded.data.references });
}

async function writeContent(supabase: AppSupabaseClient, outputId: string, content: IntakeContent): Promise<DataResult<null>> {
  const { error } = await supabase.from("outputs").update({ content: content as unknown as Json }).eq("id", outputId);
  return error ? fromPostgrest(error, "intake.writeContent") : ok(null);
}

/** Saves reviewer edits to the brief (validated on the server). */
export async function saveBriefEdits(supabase: AppSupabaseClient, outputId: string, edits: BriefEdits): Promise<DataResult<null>> {
  const parsed = briefEditsSchema.safeParse(edits);
  if (!parsed.success) return fail("invalid_input", parsed.error.issues[0]?.message ?? "التعديلات غير صالحة.");
  const loaded = await getIntakeBrief(supabase, outputId);
  if (!loaded.ok) return loaded;
  if (loaded.data.content.finalized) return fail("conflict", "استُخدم هذا الملخص لإنشاء الملف؛ لا يمكن تعديله.");
  return writeContent(supabase, outputId, applyBriefEdits(loaded.data.content, parsed.data, new Date().toISOString(), randomUUID));
}

/**
 * Creates the matter from the reviewed brief: the provisional matter becomes
 * an active matter with the brief's client, name, type and description.
 */
export async function finalizeIntake(supabase: AppSupabaseClient, outputId: string, input: FinalizeInput): Promise<DataResult<{ matterId: string }>> {
  const loaded = await getIntakeBrief(supabase, outputId);
  if (!loaded.ok) return loaded;
  const matter = await requireIntakeMatter(supabase, loaded.data.output.matter_id);
  if (!matter.ok) return matter;
  const prepared = prepareMatterFromBrief(loaded.data.content, input);
  if (!prepared.ok) return fail("invalid_input", prepared.message);

  const { error } = await supabase.from("matters").update(prepared.matter).eq("id", matter.data.id).eq("status", "intake");
  if (error) return fromPostgrest(error, "finalizeIntake.matter");
  const saved = await writeContent(supabase, outputId, { ...loaded.data.content, finalized: { matter_id: matter.data.id, at: new Date().toISOString() } });
  if (!saved.ok) return saved;
  return ok({ matterId: matter.data.id });
}

/** Discards an unfinished intake and everything uploaded to it. */
export async function discardIntake(supabase: AppSupabaseClient, matterId: string): Promise<DataResult<null>> {
  const matter = await requireIntakeMatter(supabase, matterId);
  if (!matter.ok) return matter;
  return deleteMatter(supabase, matterId);
}
