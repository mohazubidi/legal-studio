"use server";

import { revalidateWorkspace } from "@/app/(workspace)/revalidate";
import { getAIProvider } from "@/lib/ai/anthropic";
import { AI_UNCONFIGURED } from "@/lib/ai/provider";
import { requireUser } from "@/lib/supabase/server";
import type { BriefEdits, FinalizeInput } from "@/lib/tools/matter-intake/edits";
import type { IntakeFormInput } from "@/lib/tools/matter-intake/form";
import { discardIntake, finalizeIntake, generateIntakeBrief, saveBriefEdits, startIntake, submitIntakeForm } from "@/lib/tools/matter-intake/service";
import type { DataResult } from "@/lib/data/result";
import type { ActionResult } from "../source-actions";

/** Intake actions. Each re-verifies the user and validates its input on the server. */
async function authorized() {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false as const, message: auth.reason === "unconfigured" ? "الخادم غير مهيأ: إعدادات Supabase مفقودة." : "انتهت الجلسة. سجّل الدخول من جديد." };
  }
  return auth;
}

function done<T>(result: DataResult<T>): ActionResult<T> {
  revalidateWorkspace();
  return result.ok ? { ok: true, data: result.data } : { ok: false, message: result.error.message };
}

export async function startIntakeAction(): Promise<ActionResult<{ matterId: string }>> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  return done(await startIntake(auth.supabase));
}

export async function submitIntakeFormAction(matterId: string, form: IntakeFormInput): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  return done(await submitIntakeForm(auth.supabase, matterId, form));
}

export async function generateIntakeBriefAction(matterId: string): Promise<ActionResult<{ outputId: string }>> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  const provider = getAIProvider();
  if (!provider) return { ok: false, message: AI_UNCONFIGURED.message };
  return done(await generateIntakeBrief(auth.supabase, provider, matterId));
}

export async function saveBriefEditsAction(outputId: string, edits: BriefEdits): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  return done(await saveBriefEdits(auth.supabase, outputId, edits));
}

export async function finalizeIntakeAction(outputId: string, input: FinalizeInput): Promise<ActionResult<{ matterId: string }>> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  return done(await finalizeIntake(auth.supabase, outputId, input));
}

export async function discardIntakeAction(matterId: string): Promise<ActionResult> {
  const auth = await authorized();
  if (!auth.ok) return auth;
  return done(await discardIntake(auth.supabase, matterId));
}
