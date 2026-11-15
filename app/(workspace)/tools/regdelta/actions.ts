"use server";

import { revalidateWorkspace } from "@/app/(workspace)/revalidate";
import { getAIProvider } from "@/lib/ai/anthropic";
import { AI_UNCONFIGURED } from "@/lib/ai/provider";
import { requireUser } from "@/lib/supabase/server";
import type { RegDeltaEdits } from "@/lib/tools/regdelta/edits";
import { generateRegDelta, saveRegDeltaEdits } from "@/lib/tools/regdelta/service";
import type { ActionResult } from "../source-actions";

async function authorized() {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false as const, message: auth.reason === "unconfigured" ? "الخادم غير مهيأ: إعدادات Supabase مفقودة." : "انتهت الجلسة. سجّل الدخول من جديد." };
  }
  return auth;
}

/** Compares two processed versions of the matter. Returns the new output id. */
export async function generateRegDeltaAction(matterId: string, previousId: string, nextId: string): Promise<ActionResult<{ outputId: string }>> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const provider = getAIProvider();
  if (!provider) return { ok: false, message: AI_UNCONFIGURED.message };
  const result = await generateRegDelta(auth.supabase, provider, matterId, previousId, nextId);
  revalidateWorkspace();
  return result.ok ? { ok: true, data: result.data } : { ok: false, message: result.error.message };
}

/** Saves reviewer edits to the interpretation (validated on the server). */
export async function saveRegDeltaEditsAction(outputId: string, edits: RegDeltaEdits): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const result = await saveRegDeltaEdits(auth.supabase, outputId, edits);
  revalidateWorkspace();
  return result.ok ? { ok: true, data: null } : { ok: false, message: result.error.message };
}
