"use server";

import { revalidateWorkspace } from "@/app/(workspace)/revalidate";
import { addLibrarySource } from "@/lib/data/library";
import { requireUser } from "@/lib/supabase/server";

export type LibraryActionResult = { ok: true; data: { documentId: string; matterId: string } } | { ok: false; message: string };

/** Copies a law, or chosen articles, into one of the user's matters (RLS: only their own). */
export async function addLibrarySourceAction(input: { matterId: string; lawId: string; positions?: number[] }): Promise<LibraryActionResult> {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false, message: auth.reason === "unconfigured" ? "الخادم غير مهيأ: إعدادات Supabase مفقودة." : "انتهت الجلسة. سجّل الدخول من جديد." };
  }
  const result = await addLibrarySource(auth.supabase, input);
  if (!result.ok) return { ok: false, message: result.error.message };
  revalidateWorkspace();
  return { ok: true, data: { documentId: result.data.id, matterId: result.data.matter_id } };
}
