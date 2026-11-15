
export { normalizeNumbers } from "@/lib/tools/shared/numbers";
export { containsDefinitiveConclusion, NEUTRALIZED_NOTE } from "@/lib/tools/shared/language-guard";

/**
 * Checks that values the model extracted (clause numbers, amounts, dates)
 * literally appear in the text it cited. Anything that does not is dropped:
 * the tool never shows a value the contract does not contain.
 */

export { amountAppears, appearsIn, clauseAppears } from "@/lib/tools/shared/value-check";
