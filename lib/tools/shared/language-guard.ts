import { normalizeForMatch } from "./citations";

/**
 * Definitive legal conclusions the tool must not state without a configured
 * legal knowledge source (none is configured). Matched on normalised text.
 * Shared by every tool that writes AI interpretation.
 */
const DEFINITIVE_PATTERNS = [
  /غير\s*(?:قانوني|نظامي|مشروع)/,
  /مخالف(?:ة)?\s*(?:لل)?(?:نظام|قانون)/,
  /باطل/,
  /بطلان/,
  /(?:مخاطر|خطر|خطورة)\s*(?:عالية|عال|مرتفعة|مرتفع|كبيرة|جسيمة)/,
  /(?:عالي|مرتفع)\s*(?:ة)?\s*(?:الخطورة|المخاطر)/,
  /\billegal\b/i,
  /\bunlawful\b/i,
  /\bvoid\b/i,
  /\bunenforceable\b/i,
  /\bhigh[\s-]*risk\b/i,
];

export function containsDefinitiveConclusion(text: string): boolean {
  const normalized = normalizeForMatch(text);
  return DEFINITIVE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export const NEUTRALIZED_NOTE =
  "صياغة تحتاج تحققًا مهنيًا. حُجب وصف قاطع لأن الأداة لا تستند إلى مصدر معرفة قانونية مهيأ يدعم هذا الاستنتاج.";

/**
 * Claims that a document is currently in force. No tool can verify legal
 * effectiveness from uploaded files, so sentences making such a claim are
 * removed. Sentences that state the opposite caveat (cannot be verified,
 * requires verification) are kept.
 */
const EFFECTIVENESS_PATTERNS = [
  /(?:^|[\s(«"'])(?:ال)?(?:ساري|سارية|نافذ|نافذة)(?:ا|ة)?(?=$|[\s.،,؛:)»"'])/,
  /(?:دخل|دخلت|يدخل|تدخل)\s*حيز\s*(?:النفاذ|التنفيذ)/,
  /(?:المعمول|العمل)\s*به\s*حاليا/,
  /\bin\s+force\b/i,
  /\bcurrently\s+(?:effective|applicable|valid)\b/i,
];

const CAVEAT_PATTERNS = [/لا\s*يمكن\s*(?:ال)?تحقق/, /لم\s*يتم?\s*(?:ال)?تحقق/, /يتطلب\s*(?:ال)?تحقق/, /غير\s*متحقق/, /يجب\s*(?:ال)?تحقق/, /\bnot\s+verified\b/i, /\bverify\b/i];

export function claimsLegalEffect(text: string): boolean {
  const normalized = normalizeForMatch(text);
  return EFFECTIVENESS_PATTERNS.some((pattern) => pattern.test(normalized)) && !CAVEAT_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** Removes sentences that assert legal effect; returns the cleaned text and how many were removed. */
export function stripEffectivenessClaims(text: string): { text: string; removed: number } {
  const sentences = text.split(/(?<=[.؟!؛\n])\s*/);
  const kept = sentences.filter((sentence) => !claimsLegalEffect(sentence));
  return { text: kept.join(" ").trim(), removed: sentences.length - kept.length };
}
