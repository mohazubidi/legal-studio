import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { StructuredAIProvider } from "@/lib/ai/provider";
import { listDocuments } from "@/lib/data/documents";
import { getMatter } from "@/lib/data/matters";
import { fail, fromPostgrest, ok, type DataResult } from "@/lib/data/result";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { getToolOutput, saveToolOutput } from "@/lib/tools/shared/output";
import { indexSources, MAX_SOURCE_CHARS, totalSourceChars } from "@/lib/tools/shared/sources";
import type { Json, OutputRow, SourceReferenceRow } from "@/types/database";
import { parseLegalContent, type LegalContent } from "./content";
import { applyContentEdits, contentEditsSchema, type ContentEdits } from "./edits";
import { CONTENT_FORMATS, FORMAT_SPECS } from "./formats";
import { contentModelSchema } from "./model-schema";
import { buildContentPrompt, CONTENT_SYSTEM_PROMPT } from "./prompt";
import { buildContentRecord } from "./record";

/** Content is produced from these kinds of source only (not intake answers or recordings). */
export const CONTENT_SOURCE_KINDS = ["legal_text", "article", "regulation_update", "lawyer_notes", "document", "pasted_text"] as const;

export const generateContentSchema = z.object({
  format: z.enum(CONTENT_FORMATS),
  documentIds: z.array(z.string().uuid()).min(1, "اختر مصدرًا واحدًا على الأقل.").max(10, "عشرة مصادر على الأكثر."),
  firmName: z.string().trim().max(80, "اسم المكتب أطول من المسموح.").default(""),
});

export type GenerateContentInput = z.input<typeof generateContentSchema>;

export interface ContentOutputData {
  output: OutputRow;
  content: LegalContent;
  references: SourceReferenceRow[];
}

/** Produces one piece of content from chosen processed sources of a matter. */
export async function generateLegalContent(
  supabase: AppSupabaseClient,
  provider: StructuredAIProvider,
  matterId: string,
  input: GenerateContentInput,
): Promise<DataResult<{ outputId: string }>> {
  const parsed = generateContentSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", parsed.error.issues[0]?.message ?? "مدخلات غير صالحة.");
  const { format, documentIds, firmName } = parsed.data;

  const matter = await getMatter(supabase, matterId);
  if (!matter.ok) return matter;
  const documents = await listDocuments(supabase, matterId);
  if (!documents.ok) return documents;

  const chosen = documents.data.filter((d) => documentIds.includes(d.id));
  if (chosen.length !== new Set(documentIds).size) return fail("invalid_input", "أحد المصادر المختارة لا ينتمي إلى هذا الملف.");
  if (chosen.some((d) => !(CONTENT_SOURCE_KINDS as readonly string[]).includes(d.source_kind))) {
    return fail("invalid_input", "هذا النوع من المصادر لا يُستخدم لإعداد المحتوى.");
  }
  const unprocessed = chosen.filter((d) => d.processing_status !== "processed");
  if (unprocessed.length > 0) return fail("invalid_input", `عالج المصادر أولًا: ${unprocessed.map((d) => d.file_name).join("، ")}.`);

  const { sources, snapshot } = indexSources(chosen);
  if (sources.length === 0) return fail("invalid_input", "المصادر المختارة لا تحتوي نصًا يمكن الاستناد إليه.");
  if (totalSourceChars(sources) > MAX_SOURCE_CHARS) return fail("invalid_input", "نص المصادر أطول من الحد المسموح. لن يُقتطع أي جزء تلقائيًا.");

  const generated = await provider.generate({
    system: CONTENT_SYSTEM_PROMPT,
    prompt: buildContentPrompt(format, sources),
    schema: contentModelSchema,
    maxTokens: 32000,
  });
  if (!generated.ok) return fail("ai_error", generated.error.message);

  const record = buildContentRecord({
    format,
    output: generated.data,
    sources,
    snapshot,
    firmName,
    model: generated.model,
    now: new Date().toISOString(),
    newId: randomUUID,
  });
  return saveToolOutput(supabase, {
    matterId,
    toolType: "legal_content",
    title: `${FORMAT_SPECS[format].label} — ${record.content.title || "بلا عنوان"}`,
    content: record.content,
    references: record.references,
  });
}

export async function getLegalContent(supabase: AppSupabaseClient, outputId: string): Promise<DataResult<ContentOutputData>> {
  const loaded = await getToolOutput(supabase, outputId, "legal_content");
  if (!loaded.ok) return loaded.error.code === "not_found" ? fail("not_found", "المحتوى غير موجود.") : loaded;
  const content = parseLegalContent(loaded.data.output.content);
  if (!content) return fail("database_error", "المحتوى المحفوظ غير صالح ولا يمكن عرضه.");
  return ok({ output: loaded.data.output, content, references: loaded.data.references });
}

/**
 * Saves the lawyer's edits. Validated on the server against the stored content;
 * changing the content of a reviewed or approved output returns it to draft (DB trigger).
 */
export async function saveLegalContentEdits(supabase: AppSupabaseClient, outputId: string, edits: ContentEdits): Promise<DataResult<null>> {
  const parsed = contentEditsSchema.safeParse(edits);
  if (!parsed.success) return fail("invalid_input", "التعديلات غير صالحة.");
  const loaded = await getLegalContent(supabase, outputId);
  if (!loaded.ok) return loaded;
  const applied = applyContentEdits(loaded.data.content, parsed.data, loaded.data.references, new Date().toISOString(), randomUUID);
  if (!applied.ok) return fail("invalid_input", applied.message);
  const title = `${FORMAT_SPECS[applied.content.format].label} — ${applied.content.title}`.slice(0, 300);
  const { data, error } = await supabase
    .from("outputs")
    .update({ content: applied.content as unknown as Json, title })
    .eq("id", outputId)
    .select("id");
  if (error) return fromPostgrest(error, "saveLegalContentEdits");
  if (!data || data.length === 0) return fail("not_found", "المحتوى غير موجود.");
  return ok(null);
}
