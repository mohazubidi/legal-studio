import "server-only";
import { z } from "zod";
import { fail, fromPostgrest, ok, type DataResult } from "@/lib/data/result";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";
import type { Json, OutputRow, OutputStatus } from "@/types/database";
import { canTransition, parseReviewMarks, requiresAcknowledgement, type ReviewMark } from "./review";

/** Tool-specific conditions for sending an output to review. */
function notReadyReason(output: OutputRow, to: OutputStatus): string | null {
  if (to !== "in_review") return null;
  if (output.tool_type === "legal_memo") {
    const content = output.content as { draft?: unknown } | null;
    if (!content || !content.draft) return "أنشئ مسودة المذكرة قبل إرسالها للمراجعة.";
  }
  return null;
}

async function loadOutput(supabase: AppSupabaseClient, outputId: string): Promise<DataResult<OutputRow>> {
  if (!uuidSchema.safeParse(outputId).success) return fail("not_found", "المخرج غير موجود.");
  const { data, error } = await supabase.from("outputs").select("*").eq("id", outputId).maybeSingle();
  if (error) return fromPostgrest(error, "loadOutput");
  return data ? ok(data) : fail("not_found", "المخرج غير موجود.");
}

/**
 * Moves an output through review. "reviewed" and "approved" are sign-offs that
 * need an explicit acknowledgement; the database trigger rejects any
 * transition outside the allowed path regardless of what the client sends.
 */
export async function transitionOutput(
  supabase: AppSupabaseClient,
  outputId: string,
  to: OutputStatus,
  acknowledged: boolean,
): Promise<DataResult<null>> {
  const output = await loadOutput(supabase, outputId);
  if (!output.ok) return output;
  if (!canTransition(output.data.status, to)) return fail("invalid_input", "لا يمكن الانتقال إلى هذه الحالة من الحالة الحالية.");
  if (requiresAcknowledgement(to) && !acknowledged) return fail("invalid_input", "يجب الإقرار بالمراجعة قبل تنفيذ هذا الإجراء.");
  const notReady = notReadyReason(output.data, to);
  if (notReady) return fail("invalid_input", notReady);
  const { error } = await supabase.from("outputs").update({ status: to }).eq("id", outputId);
  return error ? fromPostgrest(error, "transitionOutput") : ok(null);
}

export async function saveOutputReviewNotes(supabase: AppSupabaseClient, outputId: string, notes: string): Promise<DataResult<null>> {
  if (notes.length > 10_000) return fail("invalid_input", "ملاحظات المراجعة أطول من الحد المسموح.");
  if (!uuidSchema.safeParse(outputId).success) return fail("not_found", "المخرج غير موجود.");
  const { data, error } = await supabase
    .from("outputs")
    .update({ review_notes: notes.trim() || null })
    .eq("id", outputId)
    .select("id")
    .maybeSingle();
  if (error) return fromPostgrest(error, "saveOutputReviewNotes");
  return data ? ok(null) : fail("not_found", "المخرج غير موجود.");
}

export const reviewMarkInputSchema = z.object({
  itemId: z.string().min(1).max(100).regex(/^[\w:-]+$/),
  mark: z.object({ status: z.enum(["verified", "needs_change"]), note: z.string().max(2000) }).nullable(),
});

/**
 * Records (or clears) a reviewer's mark on one item. Stored in review_marks,
 * so it does not alter generated content or reset the review state.
 */
export async function setReviewMark(
  supabase: AppSupabaseClient,
  outputId: string,
  userId: string,
  input: z.input<typeof reviewMarkInputSchema>,
): Promise<DataResult<null>> {
  const parsed = reviewMarkInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", "بيانات المراجعة غير صالحة.");
  const output = await loadOutput(supabase, outputId);
  if (!output.ok) return output;

  const marks = parseReviewMarks(output.data.review_marks);
  if (parsed.data.mark) {
    const mark: ReviewMark = { ...parsed.data.mark, note: parsed.data.mark.note.trim(), by: userId, at: new Date().toISOString() };
    marks[parsed.data.itemId] = mark;
  } else {
    delete marks[parsed.data.itemId];
  }
  const { error } = await supabase.from("outputs").update({ review_marks: marks as unknown as Json }).eq("id", outputId);
  return error ? fromPostgrest(error, "setReviewMark") : ok(null);
}
