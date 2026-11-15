import "server-only";
import { randomUUID } from "node:crypto";
import type { StructuredAIProvider } from "@/lib/ai/provider";
import { listDocuments } from "@/lib/data/documents";
import { indexSources } from "@/lib/tools/shared/sources";
import { getToolOutput, listToolOutputs, saveToolOutput } from "@/lib/tools/shared/output";
import { getMatter } from "@/lib/data/matters";
import { fail, fromPostgrest, ok, type DataResult } from "@/lib/data/result";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";
import type { Json, OutputRow, OutputStatus, SourceReferenceRow } from "@/types/database";
import { parseMemoContent, type MemoContent } from "./content";
import { memoAnalysisSchema, memoDraftSchema } from "./model-schema";
import {
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildDraftPrompt,
  DRAFT_SYSTEM_PROMPT,
  MAX_SOURCE_CHARS,
  numberReferences,
  totalSourceChars,
} from "./prompt";
import { buildMemoRecord } from "./record";
import { canTransition, requiresAcknowledgement } from "./review";

export interface MemoOutput {
  output: OutputRow;
  content: MemoContent;
  references: SourceReferenceRow[];
}

export { indexSources } from "@/lib/tools/shared/sources";

/**
 * Stages 2–5: one structured generation over every processed source, then
 * server-side citation verification, then a single saved draft output.
 */
export async function generateMemoAnalysis(
  supabase: AppSupabaseClient,
  provider: StructuredAIProvider,
  matterId: string,
): Promise<DataResult<{ outputId: string }>> {
  const matter = await getMatter(supabase, matterId);
  if (!matter.ok) return matter;
  const documents = await listDocuments(supabase, matterId);
  if (!documents.ok) return documents;

  const { sources, snapshot } = indexSources(documents.data);
  if (sources.length === 0) {
    return fail("invalid_input", "لا توجد مصادر معالجة في هذا الملف. أضف مصادر وعالجها أولًا.");
  }
  if (snapshot.some((source) => source.processing_status === "processing" || source.processing_status === "pending")) {
    return fail("conflict", "بعض المصادر ما زالت قيد المعالجة. انتظر اكتمالها ثم أعد المحاولة.");
  }
  const size = totalSourceChars(sources);
  if (size > MAX_SOURCE_CHARS) {
    return fail(
      "invalid_input",
      `حجم نصوص المصادر (${size.toLocaleString("en")} حرف) يتجاوز الحد (${MAX_SOURCE_CHARS.toLocaleString("en")}). لن يُقتطع أي نص تلقائيًا؛ قسّم المصادر على أكثر من مذكرة.`,
    );
  }

  const generated = await provider.generate({
    system: ANALYSIS_SYSTEM_PROMPT,
    prompt: buildAnalysisPrompt(
      {
        name: matter.data.matter_name,
        type: matter.data.matter_type,
        client: matter.data.client_name,
        description: matter.data.description,
      },
      sources,
    ),
    schema: memoAnalysisSchema,
  });
  if (!generated.ok) return fail("ai_error", generated.error.message);

  const record = buildMemoRecord({
    analysis: generated.data,
    sources,
    snapshot,
    model: generated.model,
    now: new Date().toISOString(),
    newId: randomUUID,
  });

  return saveMemoRecord(supabase, matterId, `مذكرة قانونية — ${matter.data.matter_name}`, record);
}

/** Persists a memo and its verified references (shared tool-output path). */
export async function saveMemoRecord(
  supabase: AppSupabaseClient,
  matterId: string,
  title: string,
  record: ReturnType<typeof buildMemoRecord>,
): Promise<DataResult<{ outputId: string }>> {
  return saveToolOutput(supabase, { matterId, toolType: "legal_memo", title, content: record.content, references: record.references });
}

/** Loads a memo output with validated content and its references. */
export async function getMemo(supabase: AppSupabaseClient, outputId: string): Promise<DataResult<MemoOutput>> {
  const loaded = await getToolOutput(supabase, outputId, "legal_memo");
  if (!loaded.ok) return loaded.error.code === "not_found" ? fail("not_found", "المذكرة غير موجودة.") : loaded;
  const content = parseMemoContent(loaded.data.output.content);
  if (!content) return fail("database_error", "محتوى المذكرة المحفوظ غير صالح ولا يمكن عرضه.");
  return ok({ output: loaded.data.output, content, references: loaded.data.references });
}

export async function listMemos(supabase: AppSupabaseClient, matterId: string): Promise<DataResult<OutputRow[]>> {
  return listToolOutputs(supabase, matterId, "legal_memo");
}

async function writeContent(supabase: AppSupabaseClient, outputId: string, content: MemoContent): Promise<DataResult<null>> {
  const { error } = await supabase
    .from("outputs")
    .update({ content: content as unknown as Json })
    .eq("id", outputId);
  return error ? fromPostgrest(error, "writeContent") : ok(null);
}

/** Stage 6: a first draft written only from the stored, verified memo material. */
export async function generateMemoDraft(
  supabase: AppSupabaseClient,
  provider: StructuredAIProvider,
  outputId: string,
): Promise<DataResult<null>> {
  const memo = await getMemo(supabase, outputId);
  if (!memo.ok) return memo;
  const { content } = memo.data;

  const numbers = numberReferences(content);
  const names = new Map(content.sources.map((source) => [source.document_id, source.file_name]));
  const generated = await provider.generate({
    system: DRAFT_SYSTEM_PROMPT,
    prompt: buildDraftPrompt(content, numbers, names),
    schema: memoDraftSchema,
  });
  if (!generated.ok) return fail("ai_error", generated.error.message);

  const text = generated.data.sections
    .filter((section) => section.heading.trim() || section.body.trim())
    .map((section) => `${section.heading.trim()}\n\n${section.body.trim()}`)
    .join("\n\n");
  const now = new Date().toISOString();
  // Saving content returns the output to draft (enforced by the database).
  return writeContent(supabase, outputId, {
    ...content,
    draft: { text, generated_at: now, model: generated.model, edited: false, updated_at: now },
  });
}

export async function saveMemoDraftText(supabase: AppSupabaseClient, outputId: string, text: string): Promise<DataResult<null>> {
  if (text.length > 200_000) return fail("invalid_input", "نص المسودة أطول من الحد المسموح.");
  const memo = await getMemo(supabase, outputId);
  if (!memo.ok) return memo;
  const { draft } = memo.data.content;
  if (!draft) return fail("invalid_input", "لا توجد مسودة لحفظها. أنشئ المسودة أولًا.");
  if (draft.text === text) return ok(null);
  return writeContent(supabase, outputId, {
    ...memo.data.content,
    draft: { ...draft, text, edited: true, updated_at: new Date().toISOString() },
  });
}

export async function saveReviewNotes(supabase: AppSupabaseClient, outputId: string, notes: string): Promise<DataResult<null>> {
  if (notes.length > 10_000) return fail("invalid_input", "ملاحظات المراجعة أطول من الحد المسموح.");
  if (!uuidSchema.safeParse(outputId).success) return fail("not_found", "المذكرة غير موجودة.");
  const { data, error } = await supabase
    .from("outputs")
    .update({ review_notes: notes.trim() || null })
    .eq("id", outputId)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrest(error, "saveReviewNotes");
  return data ? ok(null) : fail("not_found", "المذكرة غير موجودة.");
}

/**
 * Moves a memo through review. "reviewed" and "approved" are sign-offs: they
 * require the caller to pass an explicit acknowledgement, and the database
 * rejects any transition outside the allowed path.
 */
export async function transitionMemo(
  supabase: AppSupabaseClient,
  outputId: string,
  to: OutputStatus,
  acknowledged: boolean,
): Promise<DataResult<null>> {
  const memo = await getMemo(supabase, outputId);
  if (!memo.ok) return memo;
  const from = memo.data.output.status;
  if (!canTransition(from, to)) return fail("invalid_input", "لا يمكن الانتقال إلى هذه الحالة من الحالة الحالية.");
  if (requiresAcknowledgement(to) && !acknowledged) {
    return fail("invalid_input", "يجب الإقرار بالمراجعة قبل تنفيذ هذا الإجراء.");
  }
  if (to === "in_review" && !memo.data.content.draft) {
    return fail("invalid_input", "أنشئ مسودة المذكرة قبل إرسالها للمراجعة.");
  }
  const { error } = await supabase.from("outputs").update({ status: to }).eq("id", outputId);
  return error ? fromPostgrest(error, "transitionMemo") : ok(null);
}
