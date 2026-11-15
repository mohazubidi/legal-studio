"use server";

import { revalidatePath } from "next/cache";
import { getAIProvider } from "@/lib/ai/anthropic";
import { AI_UNCONFIGURED } from "@/lib/ai/provider";
import { requireUser } from "@/lib/supabase/server";
import { generateContractCompass } from "@/lib/tools/contract-compass/service";
import type { ActionResult } from "../source-actions";

/** Analyses one processed contract of the matter. Returns the new output id. */
export async function generateContractAction(matterId: string, documentId: string): Promise<ActionResult<{ outputId: string }>> {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false, message: auth.reason === "unconfigured" ? "الخادم غير مهيأ: إعدادات Supabase مفقودة." : "انتهت الجلسة. سجّل الدخول من جديد." };
  }
  const provider = getAIProvider();
  if (!provider) return { ok: false, message: AI_UNCONFIGURED.message };
  const result = await generateContractCompass(auth.supabase, provider, matterId, documentId);
  revalidatePath("/tools/contract-compass");
  return result.ok ? { ok: true, data: result.data } : { ok: false, message: result.error.message };
}
