"use server";

import { revalidateWorkspace } from "@/app/(workspace)/revalidate";
import { getAIProvider } from "@/lib/ai/anthropic";
import { AI_UNCONFIGURED } from "@/lib/ai/provider";
import type { DataResult } from "@/lib/data/result";
import { requireUser } from "@/lib/supabase/server";
import {
  generateMemoAnalysis,
  generateMemoDraft,
  saveMemoDraftText,
} from "@/lib/tools/legal-memo/service";

import type { ActionResult } from "../source-actions";

export type { ActionResult };


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
  revalidateWorkspace();
  return toAction(result);
}

/** Stage 6. */
export async function generateDraftAction(outputId: string): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const provider = getAIProvider();
  if (!provider) return { ok: false, message: AI_UNCONFIGURED.message };
  const result = await generateMemoDraft(auth.supabase, provider, outputId);
  revalidateWorkspace();
  return toAction(result);
}

export async function saveDraftAction(outputId: string, text: string): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  if (typeof text !== "string") return { ok: false, message: "نص غير صالح." };
  const result = await saveMemoDraftText(auth.supabase, outputId, text);
  revalidateWorkspace();
  return toAction(result);
}
