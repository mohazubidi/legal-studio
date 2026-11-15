import "server-only";
import { randomUUID } from "node:crypto";
import type { StructuredAIProvider } from "@/lib/ai/provider";
import { getDocument } from "@/lib/data/documents";
import { getMatter } from "@/lib/data/matters";
import { fail, fromPostgrest, ok, type DataResult } from "@/lib/data/result";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { getToolOutput, saveToolOutput } from "@/lib/tools/shared/output";
import { indexSources, MAX_SOURCE_CHARS, totalSourceChars } from "@/lib/tools/shared/sources";
import type { DocumentRow, Json, OutputRow, SourceReferenceRow } from "@/types/database";
import { alignProvisions } from "./compare";
import { parseRegDeltaContent, type RegDeltaContent } from "./content";
import { regDeltaSchema } from "./model-schema";
import { applyRegDeltaEdits, regDeltaEditsSchema, type RegDeltaEdits } from "./edits";
import { buildRegDeltaPrompt, REGDELTA_SYSTEM_PROMPT } from "./prompt";
import { splitProvisions } from "./provisions";
import { buildRegDeltaRecord, planChanges } from "./record";

export interface RegDeltaOutputData {
  output: OutputRow;
  content: RegDeltaContent;
  references: SourceReferenceRow[];
}

async function loadVersion(supabase: AppSupabaseClient, matterId: string, documentId: string, label: string): Promise<DataResult<DocumentRow>> {
  const document = await getDocument(supabase, documentId);
  if (!document.ok) return document;
  if (document.data.matter_id !== matterId) return fail("invalid_input", `${label} لا تنتمي إلى هذا الملف.`);
  if (document.data.processing_status !== "processed") {
    return fail("invalid_input", document.data.processing_status === "failed" ? `تعذّرت معالجة ${label}: ${document.data.processing_error ?? ""}` : `عالج ${label} أولًا.`);
  }
  return document;
}

/**
 * Compares two versions: split into provisions and match them on the server,
 * have the model explain the computed changes, then save a draft for review.
 */
export async function generateRegDelta(
  supabase: AppSupabaseClient,
  provider: StructuredAIProvider,
  matterId: string,
  previousId: string,
  nextId: string,
): Promise<DataResult<{ outputId: string }>> {
  if (previousId === nextId) return fail("invalid_input", "اختر مستندين مختلفين للنسختين السابقة والجديدة.");
  const matter = await getMatter(supabase, matterId);
  if (!matter.ok) return matter;
  const previousDoc = await loadVersion(supabase, matterId, previousId, "النسخة السابقة");
  if (!previousDoc.ok) return previousDoc;
  const nextDoc = await loadVersion(supabase, matterId, nextId, "النسخة الجديدة");
  if (!nextDoc.ok) return nextDoc;

  const { sources, snapshot } = indexSources([previousDoc.data, nextDoc.data]);
  const previousSource = sources.find((s) => s.documentId === previousId);
  const nextSource = sources.find((s) => s.documentId === nextId);
  if (!previousSource || !nextSource) return fail("invalid_input", "إحدى النسختين لا تحتوي على نص قابل للمقارنة.");
  if (totalSourceChars(sources) > MAX_SOURCE_CHARS) return fail("invalid_input", "حجم النسختين يتجاوز الحد المسموح للمقارنة. لن يُقتطع أي نص تلقائيًا.");

  const previous = splitProvisions(previousSource, "A");
  const next = splitProvisions(nextSource, "B");
  const { changes, unchanged } = planChanges(alignProvisions(previous.provisions, next.provisions));
  if (changes.length === 0) return fail("invalid_input", "لم يُرصد أي فرق نصي بين النسختين.");

  const generated = await provider.generate({
    system: REGDELTA_SYSTEM_PROMPT,
    prompt: buildRegDeltaPrompt({ previousName: previousDoc.data.file_name, nextName: nextDoc.data.file_name, changes, unchangedCount: unchanged.length }),
    schema: regDeltaSchema,
  });
  if (!generated.ok) return fail("ai_error", generated.error.message);

  const record = buildRegDeltaRecord({
    planned: changes,
    unchanged,
    previous: { documentId: previousId, fileName: previousDoc.data.file_name, numbered: previous.numbered, provisions: previous.provisions },
    next: { documentId: nextId, fileName: nextDoc.data.file_name, numbered: next.numbered, provisions: next.provisions },
    snapshot,
    ai: generated.data,
    model: generated.model,
    now: new Date().toISOString(),
    newId: randomUUID,
  });
  return saveToolOutput(supabase, {
    matterId,
    toolType: "regdelta",
    title: `مقارنة: ${previousDoc.data.file_name} ← ${nextDoc.data.file_name}`,
    content: record.content,
    references: record.references,
  });
}

export async function getRegDelta(supabase: AppSupabaseClient, outputId: string): Promise<DataResult<RegDeltaOutputData>> {
  const loaded = await getToolOutput(supabase, outputId, "regdelta");
  if (!loaded.ok) return loaded.error.code === "not_found" ? fail("not_found", "المقارنة غير موجودة.") : loaded;
  const content = parseRegDeltaContent(loaded.data.output.content);
  if (!content) return fail("database_error", "محتوى المقارنة المحفوظ غير صالح ولا يمكن عرضه.");
  return ok({ output: loaded.data.output, content, references: loaded.data.references });
}

/** Saves reviewer edits. Editing content returns the comparison to draft (enforced by the database). */
export async function saveRegDeltaEdits(supabase: AppSupabaseClient, outputId: string, edits: RegDeltaEdits): Promise<DataResult<null>> {
  const parsed = regDeltaEditsSchema.safeParse(edits);
  if (!parsed.success) return fail("invalid_input", "التعديلات غير صالحة.");
  const loaded = await getRegDelta(supabase, outputId);
  if (!loaded.ok) return loaded;
  const content = applyRegDeltaEdits(loaded.data.content, parsed.data, new Date().toISOString(), randomUUID);
  const { error } = await supabase.from("outputs").update({ content: content as unknown as Json }).eq("id", outputId);
  return error ? fromPostgrest(error, "saveRegDeltaEdits") : ok(null);
}
