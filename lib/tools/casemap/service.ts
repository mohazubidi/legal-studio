import "server-only";
import { randomUUID } from "node:crypto";
import type { StructuredAIProvider } from "@/lib/ai/provider";
import { listDocuments } from "@/lib/data/documents";
import { getMatter } from "@/lib/data/matters";
import { fail, ok, type DataResult } from "@/lib/data/result";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { getToolOutput, listToolOutputs, saveToolOutput } from "@/lib/tools/shared/output";
import { indexSources, MAX_SOURCE_CHARS, totalSourceChars } from "@/lib/tools/shared/sources";
import type { OutputRow, SourceReferenceRow } from "@/types/database";
import { parseCaseMapContent, type CaseMapContent } from "./content";
import { caseMapSchema } from "./model-schema";
import { buildCaseMapPrompt, CASEMAP_SYSTEM_PROMPT } from "./prompt";
import { buildCaseMapRecord } from "./record";

export interface CaseMapOutputData {
  output: OutputRow;
  content: CaseMapContent;
  references: SourceReferenceRow[];
}

/** Generates a CaseMap from every processed source of the matter and saves it with verified references. */
export async function generateCaseMap(
  supabase: AppSupabaseClient,
  provider: StructuredAIProvider,
  matterId: string,
): Promise<DataResult<{ outputId: string }>> {
  const matter = await getMatter(supabase, matterId);
  if (!matter.ok) return matter;
  const documents = await listDocuments(supabase, matterId);
  if (!documents.ok) return documents;

  const { sources, snapshot } = indexSources(documents.data);
  if (sources.length === 0) return fail("invalid_input", "لا توجد مصادر معالجة في هذا الملف. أضف مصادر وعالجها أولًا.");
  if (snapshot.some((s) => s.processing_status === "processing" || s.processing_status === "pending")) {
    return fail("conflict", "بعض المصادر ما زالت قيد المعالجة. انتظر اكتمالها ثم أعد المحاولة.");
  }
  const size = totalSourceChars(sources);
  if (size > MAX_SOURCE_CHARS) {
    return fail("invalid_input", `حجم نصوص المصادر (${size.toLocaleString("en")} حرف) يتجاوز الحد (${MAX_SOURCE_CHARS.toLocaleString("en")}). لن يُقتطع أي نص تلقائيًا.`);
  }

  const generated = await provider.generate({
    system: CASEMAP_SYSTEM_PROMPT,
    prompt: buildCaseMapPrompt(
      { name: matter.data.matter_name, type: matter.data.matter_type, client: matter.data.client_name, description: matter.data.description },
      sources,
    ),
    schema: caseMapSchema,
  });
  if (!generated.ok) return fail("ai_error", generated.error.message);

  const record = buildCaseMapRecord({ output: generated.data, sources, snapshot, model: generated.model, now: new Date().toISOString(), newId: randomUUID });
  return saveToolOutput(supabase, {
    matterId,
    toolType: "casemap",
    title: `خريطة القضية — ${matter.data.matter_name}`,
    content: record.content,
    references: record.references,
  });
}

export async function getCaseMap(supabase: AppSupabaseClient, outputId: string): Promise<DataResult<CaseMapOutputData>> {
  const loaded = await getToolOutput(supabase, outputId, "casemap");
  if (!loaded.ok) return loaded.error.code === "not_found" ? fail("not_found", "الخريطة غير موجودة.") : loaded;
  const content = parseCaseMapContent(loaded.data.output.content);
  if (!content) return fail("database_error", "محتوى الخريطة المحفوظ غير صالح ولا يمكن عرضه.");
  return ok({ output: loaded.data.output, content, references: loaded.data.references });
}

export async function listCaseMaps(supabase: AppSupabaseClient, matterId: string): Promise<DataResult<OutputRow[]>> {
  return listToolOutputs(supabase, matterId, "casemap");
}
