import { normalizeForMatch } from "@/lib/tools/shared/citations";
import { normalizeNumbers } from "@/lib/tools/shared/numbers";

export { normalizeNumbers } from "@/lib/tools/shared/numbers";
export { containsDefinitiveConclusion, NEUTRALIZED_NOTE } from "@/lib/tools/shared/language-guard";

/**
 * Checks that values the model extracted (clause numbers, amounts, dates)
 * literally appear in the text it cited. Anything that does not is dropped:
 * the tool never shows a value the contract does not contain.
 */

function prepare(text: string): string {
  return normalizeNumbers(normalizeForMatch(text));
}

/** The value appears in the haystack (ignoring diacritics, spacing, digit style and separators). */
export function appearsIn(value: string, haystack: string): boolean {
  const needle = prepare(value);
  return needle.length > 0 && prepare(haystack).includes(needle);
}

/** A number token appears as a whole number (not inside a longer one). */
function hasNumberToken(token: string, haystack: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");
  return new RegExp(`(^|[^\\d.])${escaped}(?![\\d]|\\.\\d)`).test(haystack);
}

/** A clause reference such as "البند 7.2" or "7/2": its wording, or its number, must appear in the cited text. */
export function clauseAppears(clauseRef: string, haystack: string): boolean {
  if (!clauseRef.trim()) return false;
  // Numbered clauses must match the whole number ("7.2" is not "7.20").
  const number = /\d+(?:[.\-/]\d+)*/.exec(normalizeNumbers(clauseRef))?.[0];
  if (number) return hasNumberToken(number, prepare(haystack));
  return appearsIn(clauseRef, haystack);
}

/** Every number in a stated amount must appear in the cited text; amounts written in words must appear verbatim. */
export function amountAppears(amountText: string, haystack: string): boolean {
  if (!amountText.trim()) return false;
  const numbers = normalizeNumbers(amountText).match(/\d+(?:\.\d+)?/g);
  if (!numbers) return appearsIn(amountText, haystack);
  const text = prepare(haystack);
  return numbers.every((n) => hasNumberToken(n, text));
}

