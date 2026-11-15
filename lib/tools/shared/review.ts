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
  approved: "اعتماد",
};

/** A reviewer's mark on one extracted item. Stored in outputs.review_marks, outside the generated content. */
export interface ReviewMark {
  status: "verified" | "needs_change";
  note: string;
  by: string;
  at: string;
}

export type ReviewMarks = Record<string, ReviewMark>;

export const REVIEW_MARK_LABELS: Record<ReviewMark["status"], string> = {
  verified: "تم التحقق",
  needs_change: "يحتاج تصحيحًا",
};

/** Reads outputs.review_marks defensively; malformed entries are ignored. */
export function parseReviewMarks(value: unknown): ReviewMarks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const marks: ReviewMarks = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const mark = raw as Partial<ReviewMark>;
    if ((mark.status === "verified" || mark.status === "needs_change") && typeof mark.by === "string" && typeof mark.at === "string") {
      marks[id] = { status: mark.status, note: typeof mark.note === "string" ? mark.note : "", by: mark.by, at: mark.at };
    }
  }
  return marks;
}
