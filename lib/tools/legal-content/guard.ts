import { normalizeForMatch } from "@/lib/tools/shared/citations";
import { containsDefinitiveConclusion, stripEffectivenessClaims, stripLegalAdvice } from "@/lib/tools/shared/language-guard";
import { normalizeNumbers } from "@/lib/tools/shared/numbers";

/**
 * AI-written content may explain the supplied material but may not add to it.
 * A sentence is removed when it introduces a number (article, amount, date,
 * period) or names a regulation, law or decision that the supplied text does
 * not contain. The supplied text is the only authority the content may cite.
 */

const prepare = (text: string) => normalizeNumbers(normalizeForMatch(text)).replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");

const NUMBER = /\d+(?:[./]\d+)*/g;
/** "نظام العمل", "اللائحة التنفيذية", "قرار مجلس الوزراء", "المرسوم الملكي" …: the instrument word and the next word. */
const INSTRUMENT = /(?:^|[^\p{L}])[وبلفك]?((?:ال)?(?:نظام|انظمه|لائحه|لوائح|قانون|قرار|مرسوم|تعميم|اتفاقيه|قاعده)\s+((?:ال)?[\p{L}]{2,}))/gu;
/** Words after an instrument that refer back to it rather than name another one. */
const REFERRING = new Set(["الجديد", "الجديده", "المذكور", "المذكوره", "المشار", "الصادر", "الصادره", "المعدل", "المعدله", "الحالي", "الحاليه", "السابق", "السابقه", "نفسه", "نفسها", "هذا", "هذه", "ذلك", "تلك", "المعني", "المعنيه"]);
const LATIN_CITATION = /\b(?:Article|Art\.|Section|Law|Act|Regulation|Decree)\s+[\p{L}\d]+/giu;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.؟?!؛\n])\s*/).filter((s) => s.trim().length > 0);
}

function numberTokens(text: string): string[] {
  return prepare(text).match(NUMBER) ?? [];
}

/** References in a sentence that the source does not contain. */
export function unsupportedReferences(sentence: string, sourceText: string): string[] {
  const source = prepare(sourceText);
  const sourceNumbers = new Set(numberTokens(sourceText));
  const missing: string[] = [];
  for (const n of numberTokens(sentence)) if (!sourceNumbers.has(n)) missing.push(n);
  const normalized = prepare(sentence);
  for (const match of normalized.matchAll(INSTRUMENT)) {
    const phrase = match[1].trim();
    // Generic mentions ("النظام", "القرار الجديد") are fine; a named instrument must appear in the source.
    if (REFERRING.has(match[2])) continue;
    if (!source.includes(phrase)) missing.push(phrase);
  }
  for (const match of sentence.matchAll(LATIN_CITATION)) if (!sourceText.toLowerCase().includes(match[0].toLowerCase())) missing.push(match[0]);
  return missing;
}

export interface GuardStats {
  advice: number;
  effectiveness: number;
  definitive: number;
  unsupported: number;
}

export const emptyStats = (): GuardStats => ({ advice: 0, effectiveness: 0, definitive: 0, unsupported: 0 });

/**
 * Cleans AI-written text: removes advice, claims of legal effect, definitive
 * conclusions and sentences with references absent from the source.
 */
export function guardAiText(text: string, sourceText: string, stats: GuardStats): string {
  const advice = stripLegalAdvice(text.trim());
  stats.advice += advice.removed;
  const effect = stripEffectivenessClaims(advice.text);
  stats.effectiveness += effect.removed;
  const kept = sentencesOf(effect.text).filter((sentence) => {
    if (containsDefinitiveConclusion(sentence)) {
      stats.definitive += 1;
      return false;
    }
    if (unsupportedReferences(sentence, sourceText).length > 0) {
      stats.unsupported += 1;
      return false;
    }
    return true;
  });
  return kept.join(" ").trim();
}

/** User-facing warnings for what the guard removed. */
export function guardWarnings(stats: GuardStats): string[] {
  const warnings: string[] = [];
  if (stats.unsupported > 0) warnings.push(`حُذفت ${stats.unsupported} جملة تذكر رقمًا أو مادة أو نظامًا غير وارد في النص المُدخل.`);
  if (stats.advice > 0) warnings.push(`حُذفت ${stats.advice} عبارة تتضمن نصيحة قانونية لحالة بعينها.`);
  if (stats.effectiveness > 0) warnings.push(`حُذفت ${stats.effectiveness} عبارة تؤكد سريان نص لا يمكن التحقق منه من المُدخلات.`);
  if (stats.definitive > 0) warnings.push(`حُذفت ${stats.definitive} عبارة تتضمن حكمًا قانونيًا قاطعًا.`);
  return warnings;
}
