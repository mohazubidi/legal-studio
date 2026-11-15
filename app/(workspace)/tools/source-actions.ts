"use server";

import { revalidatePath } from "next/cache";
import { createTextSource, deleteDocument, listDocuments, processDocument } from "@/lib/data/documents";
import { createMatter } from "@/lib/data/matters";
import { requireUser } from "@/lib/supabase/server";

/**
 * Matter and source actions shared by every tool (Legal Memo, CaseMap, …).
 * Each action re-verifies the user; all data access runs under their session (RLS).
 */
export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; message: string };

const TOOLS_PATH = "/tools";

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

export async function createMatterAction(input: { matter_name: string; matter_type?: string; client_name?: string; description?: string }): Promise<ActionResult<{ id: string }>> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const result = await createMatter(auth.supabase, input);
  if (!result.ok) return { ok: false, message: result.error.message };
  revalidatePath(TOOLS_PATH, "layout");
  return { ok: true, data: { id: result.data.id } };
}

export async function addTextSourceAction(
  matterId: string,
  input: { kind: "pasted_text" | "lawyer_notes" | "meeting_transcript"; title?: string; text: string },
): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const result = await createTextSource(auth.supabase, matterId, input);
  revalidatePath(TOOLS_PATH, "layout");
  return result.ok ? { ok: true, data: null } : { ok: false, message: result.error.message };
}

/** Stage 1 for one source (also the retry path for failed sources). */
export async function processSourceAction(documentId: string): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const result = await processDocument(auth.supabase, documentId);
  revalidatePath(TOOLS_PATH, "layout");
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
  revalidatePath(TOOLS_PATH, "layout");
  return { ok: true, data: { processed, failed } };
}

export async function removeSourceAction(documentId: string): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const result = await deleteDocument(auth.supabase, documentId);
  revalidatePath(TOOLS_PATH, "layout");
  return result.ok ? { ok: true, data: null } : { ok: false, message: result.error.message };
}

