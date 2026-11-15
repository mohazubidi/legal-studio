"use server";

import { revalidatePath } from "next/cache";
import { getAIProvider } from "@/lib/ai/anthropic";
import { AI_UNCONFIGURED } from "@/lib/ai/provider";
import { createTextSource, deleteDocument, listDocuments, processDocument } from "@/lib/data/documents";
import { createMatter } from "@/lib/data/matters";
import type { DataResult } from "@/lib/data/result";
import { requireUser } from "@/lib/supabase/server";
import {
  generateMemoAnalysis,
  generateMemoDraft,
  saveMemoDraftText,
  saveReviewNotes,
  transitionMemo,
} from "@/lib/tools/legal-memo/service";
import { outputStatusSchema, uuidSchema } from "@/lib/validation/schemas";
import type { OutputStatus } from "@/types/database";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; message: string };

const TOOL_PATH = "/tools/legal-memo";

async function authorized() {
  const auth = await requireUser();
  if (!auth.ok) {
    return {
      ok: false as const,
      message: auth.reason === "unconfigured" ? "الخادم غير مهيأ: إعدادات Supabase مفقودة." : "انتهت الجلسة. سجّل الدخول من جديد.",
    };
  }
  return auth;
}

function toAction<T>(result: DataResult<T>): ActionResult<T> {
  return result.ok ? { ok: true, data: result.data } : { ok: false, message: result.error.message };
}

export async function createMatterAction(input: { matter_name: string; matter_type?: string; client_name?: string; description?: string }): Promise<ActionResult<{ id: string }>> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const result = await createMatter(auth.supabase, input);
  if (!result.ok) return { ok: false, message: result.error.message };
  revalidatePath(TOOL_PATH);
  return { ok: true, data: { id: result.data.id } };
}

export async function addTextSourceAction(
  matterId: string,
  input: { kind: "pasted_text" | "lawyer_notes" | "meeting_transcript"; title?: string; text: string },
): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const result = await createTextSource(auth.supabase, matterId, input);
  revalidatePath(TOOL_PATH);
  return result.ok ? { ok: true, data: null } : { ok: false, message: result.error.message };
}

/** Stage 1 for one source (also the retry path for failed sources). */
export async function processSourceAction(documentId: string): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const result = await processDocument(auth.supabase, documentId);
  revalidatePath(TOOL_PATH);
  if (!result.ok) return { ok: false, message: result.error.message };
  return result.data.processing_status === "failed"
    ? { ok: false, message: result.data.processing_error ?? "تعذّرت المعالجة." }
    : { ok: true, data: null };
}

/** Stage 1 for every source that is waiting for processing. Failures are recorded per source. */
export async function processPendingSourcesAction(matterId: string): Promise<ActionResult<{ processed: number; failed: number }>> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const documents = await listDocuments(auth.supabase, matterId);
  if (!documents.ok) return { ok: false, message: documents.error.message };

  let processed = 0;
  let failed = 0;
  for (const document of documents.data) {
    if (document.processing_status !== "uploaded") continue;
    const result = await processDocument(auth.supabase, document.id);
    if (result.ok && result.data.processing_status === "processed") processed += 1;
    else failed += 1;
  }
  revalidatePath(TOOL_PATH);
  return { ok: true, data: { processed, failed } };
}

export async function removeSourceAction(documentId: string): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const result = await deleteDocument(auth.supabase, documentId);
  revalidatePath(TOOL_PATH);
  return toAction(result);
}

/** Stages 2–5. Returns the new memo id. */
export async function generateMemoAction(matterId: string): Promise<ActionResult<{ outputId: string }>> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const provider = getAIProvider();
  if (!provider) return { ok: false, message: AI_UNCONFIGURED.message };
  const result = await generateMemoAnalysis(auth.supabase, provider, matterId);
  revalidatePath(TOOL_PATH);
  return toAction(result);
}

/** Stage 6. */
export async function generateDraftAction(outputId: string): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const provider = getAIProvider();
  if (!provider) return { ok: false, message: AI_UNCONFIGURED.message };
  const result = await generateMemoDraft(auth.supabase, provider, outputId);
  revalidatePath(`${TOOL_PATH}/${outputId}`);
  return toAction(result);
}

export async function saveDraftAction(outputId: string, text: string): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  if (typeof text !== "string") return { ok: false, message: "نص غير صالح." };
  const result = await saveMemoDraftText(auth.supabase, outputId, text);
  revalidatePath(`${TOOL_PATH}/${outputId}`);
  return toAction(result);
}

export async function saveReviewNotesAction(outputId: string, notes: string): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  if (typeof notes !== "string") return { ok: false, message: "نص غير صالح." };
  const result = await saveReviewNotes(auth.supabase, outputId, notes);
  revalidatePath(`${TOOL_PATH}/${outputId}`);
  return toAction(result);
}

export async function transitionMemoAction(outputId: string, to: OutputStatus, acknowledged: boolean): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(outputId).success || !outputStatusSchema.safeParse(to).success) {
    return { ok: false, message: "طلب غير صالح." };
  }
  const result = await transitionMemo(auth.supabase, outputId, to, acknowledged === true);
  revalidatePath(`${TOOL_PATH}/${outputId}`);
  return toAction(result);
}
