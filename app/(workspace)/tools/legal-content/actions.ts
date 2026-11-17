"use server";

import { revalidateWorkspace } from "@/app/(workspace)/revalidate";
import { getAIProvider } from "@/lib/ai/anthropic";
import { AI_UNCONFIGURED } from "@/lib/ai/provider";
import { requireUser } from "@/lib/supabase/server";
import type { ContentEdits } from "@/lib/tools/legal-content/edits";
import { generateLegalContent, saveLegalContentEdits, type GenerateContentInput } from "@/lib/tools/legal-content/service";
import type { ActionResult } from "../source-actions";

async function authorized() {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false as const, message: auth.reason === "unconfigured" ? "الخادم غير مهيأ: إعدادات Supabase مفقودة." : "انتهت الجلسة. سجّل الدخول من جديد." };
  }
  return auth;
}

/** Produces one piece of content from chosen sources. Input is validated on the server. */
export async function generateLegalContentAction(matterId: string, input: GenerateContentInput): Promise<ActionResult<{ outputId: string }>> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const provider = getAIProvider();
  if (!provider) return { ok: false, message: AI_UNCONFIGURED.message };
  const result = await generateLegalContent(auth.supabase, provider, matterId, input);
  revalidateWorkspace();
  return result.ok ? { ok: true, data: result.data } : { ok: false, message: result.error.message };
}

/** Saves the lawyer's text edits (structure and limits re-checked on the server). */
export async function saveLegalContentEditsAction(outputId: string, edits: ContentEdits): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const result = await saveLegalContentEdits(auth.supabase, outputId, edits);
  revalidateWorkspace();
  return result.ok ? { ok: true, data: null } : { ok: false, message: result.error.message };
}
