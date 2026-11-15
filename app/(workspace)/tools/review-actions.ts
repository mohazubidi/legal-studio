"use server";

import { revalidateWorkspace } from "@/app/(workspace)/revalidate";
import { requireUser } from "@/lib/supabase/server";
import { saveOutputReviewNotes, setReviewMark, transitionOutput } from "@/lib/tools/shared/review-service";
import { outputStatusSchema, uuidSchema } from "@/lib/validation/schemas";
import type { OutputStatus } from "@/types/database";
import type { ActionResult } from "./source-actions";

/** Review actions shared by every tool. Each re-verifies the user; RLS limits access to their outputs. */

async function authorized() {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false as const, message: auth.reason === "unconfigured" ? "الخادم غير مهيأ: إعدادات Supabase مفقودة." : "انتهت الجلسة. سجّل الدخول من جديد." };
  }
  return auth;
}

export async function transitionOutputAction(outputId: string, to: OutputStatus, acknowledged: boolean): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  if (!uuidSchema.safeParse(outputId).success || !outputStatusSchema.safeParse(to).success) return { ok: false, message: "طلب غير صالح." };
  const result = await transitionOutput(auth.supabase, outputId, to, acknowledged === true);
  revalidateWorkspace();
  return result.ok ? { ok: true, data: null } : { ok: false, message: result.error.message };
}

export async function saveReviewNotesAction(outputId: string, notes: string): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  if (typeof notes !== "string") return { ok: false, message: "نص غير صالح." };
  const result = await saveOutputReviewNotes(auth.supabase, outputId, notes);
  revalidateWorkspace();
  return result.ok ? { ok: true, data: null } : { ok: false, message: result.error.message };
}

export async function setReviewMarkAction(
  outputId: string,
  itemId: string,
  mark: { status: "verified" | "needs_change"; note: string } | null,
): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const result = await setReviewMark(auth.supabase, outputId, auth.user.id, { itemId, mark });
  revalidateWorkspace();
  return result.ok ? { ok: true, data: null } : { ok: false, message: result.error.message };
}
