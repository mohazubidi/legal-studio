import "server-only";
import { randomUUID } from "node:crypto";
import type { StructuredAIProvider } from "@/lib/ai/provider";
import { getDocument } from "@/lib/data/documents";
import { getMatter } from "@/lib/data/matters";
import { fail, ok, type DataResult } from "@/lib/data/result";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { getToolOutput, saveToolOutput } from "@/lib/tools/shared/output";
import { indexSources, MAX_SOURCE_CHARS, totalSourceChars } from "@/lib/tools/shared/sources";
import type { OutputRow, SourceReferenceRow } from "@/types/database";
import { parseContractContent, type ContractContent } from "./content";
import { getLegalKnowledgeSource } from "./knowledge";
import { contractSchema } from "./model-schema";
import { buildContractPrompt, CONTRACT_SYSTEM_PROMPT } from "./prompt";
import { buildContractRecord } from "./record";

export interface ContractOutputData {
  output: OutputRow;
  content: ContractContent;
  references: SourceReferenceRow[];
}

/** Analyses one processed contract of a matter and saves the result with verified references. */
export async function generateContractCompass(
  supabase: AppSupabaseClient,
  provider: StructuredAIProvider,
  matterId: string,
  documentId: string,
): Promise<DataResult<{ outputId: string }>> {
  const matter = await getMatter(supabase, matterId);
  if (!matter.ok) return matter;
  const document = await getDocument(supabase, documentId);
  if (!document.ok) return document;
  if (document.data.matter_id !== matterId) return fail("invalid_input", "المستند لا ينتمي إلى هذا الملف.");
  if (document.data.processing_status !== "processed") {
    return fail("invalid_input", document.data.processing_status === "failed" ? `تعذّرت معالجة العقد: ${document.data.processing_error ?? ""}` : "عالج العقد أولًا قبل تحليله.");
  }

  const { sources, snapshot } = indexSources([document.data]);
  const source = sources[0];
  if (!source) return fail("invalid_input", "لا يحتوي العقد على نص قابل للتحليل.");
  if (totalSourceChars(sources) > MAX_SOURCE_CHARS) return fail("invalid_input", "نص العقد أطول من الحد المسموح للتحليل. لن يُقتطع أي جزء تلقائيًا.");

  const generated = await provider.generate({
    system: CONTRACT_SYSTEM_PROMPT,
    prompt: buildContractPrompt(
      { name: matter.data.matter_name, type: matter.data.matter_type, client: matter.data.client_name, description: matter.data.description },
      source,
    ),
    schema: contractSchema,
  });
  if (!generated.ok) return fail("ai_error", generated.error.message);

  const record = buildContractRecord({
    output: generated.data,
    source,
    snapshot,
    model: generated.model,
    now: new Date().toISOString(),
    newId: randomUUID,
    knowledgeSource: getLegalKnowledgeSource(),
  });
  return saveToolOutput(supabase, {
    matterId,
    toolType: "contract_compass",
    title: `بوصلة العقود — ${document.data.file_name}`,
    content: record.content,
    references: record.references,
  });
}

export async function getContractCompass(supabase: AppSupabaseClient, outputId: string): Promise<DataResult<ContractOutputData>> {
  const loaded = await getToolOutput(supabase, outputId, "contract_compass");
  if (!loaded.ok) return loaded.error.code === "not_found" ? fail("not_found", "التحليل غير موجود.") : loaded;
  const content = parseContractContent(loaded.data.output.content);
  if (!content) return fail("database_error", "محتوى التحليل المحفوظ غير صالح ولا يمكن عرضه.");
  return ok({ output: loaded.data.output, content, references: loaded.data.references });
}
