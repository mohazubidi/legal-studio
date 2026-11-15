"use server";

import { revalidateWorkspace } from "@/app/(workspace)/revalidate";
import { getAIProvider } from "@/lib/ai/anthropic";
import { AI_UNCONFIGURED } from "@/lib/ai/provider";
import { requireUser } from "@/lib/supabase/server";
import { generateCaseMap } from "@/lib/tools/casemap/service";
import type { ActionResult } from "../source-actions";

/** Builds a CaseMap from the matter's processed sources. Returns the new output id. */
export async function generateCaseMapAction(matterId: string): Promise<ActionResult<{ outputId: string }>> {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false, message: auth.reason === "unconfigured" ? "الخادم غير مهيأ: إعدادات Supabase مفقودة." : "انتهت الجلسة. سجّل الدخول من جديد." };
  }
  const provider = getAIProvider();
  if (!provider) return { ok: false, message: AI_UNCONFIGURED.message };
  const result = await generateCaseMap(auth.supabase, provider, matterId);
  revalidateWorkspace();
  return result.ok ? { ok: true, data: result.data } : { ok: false, message: result.error.message };
}
