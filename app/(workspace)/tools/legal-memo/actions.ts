"use server";

import { revalidatePath } from "next/cache";
import { getAIProvider } from "@/lib/ai/anthropic";
import { AI_UNCONFIGURED } from "@/lib/ai/provider";
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

import type { ActionResult } from "../source-actions";

export type { ActionResult };

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
