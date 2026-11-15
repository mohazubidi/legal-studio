import type { OutputStatus } from "@/types/database";

/**
 * Human-review workflow. Mirrors the enforce_output_review() trigger in
 * supabase/migrations/0003_legal_memo.sql, which is the real boundary; this
 * copy drives the UI and gives early, readable errors.
 */
export const REVIEW_TRANSITIONS: Record<OutputStatus, readonly OutputStatus[]> = {
  draft: ["in_review"],
  in_review: ["draft", "reviewed"],
  reviewed: ["draft", "in_review", "approved"],
  approved: ["draft"],
};

export function canTransition(from: OutputStatus, to: OutputStatus): boolean {
  return REVIEW_TRANSITIONS[from].includes(to);
}

/** Moving to these states is a professional sign-off and needs an explicit acknowledgement. */
export function requiresAcknowledgement(to: OutputStatus): boolean {
  return to === "reviewed" || to === "approved";
}

export const REVIEW_ACTION_LABELS: Record<OutputStatus, string> = {
  draft: "إعادة إلى مسودة",
  in_review: "إرسال للمراجعة",
  reviewed: "تأكيد المراجعة",
  approved: "اعتماد المذكرة",
};
