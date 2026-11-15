import { normalizeForMatch } from "@/lib/tools/shared/citations";
import { arabicNumberWordsToDigits, normalizeNumbers } from "@/lib/tools/shared/numbers";
import type { Provision } from "./provisions";

/**
 * Deterministic structural comparison: match provisions across versions,
 * then classify each pair from the text itself. The model never decides what
 * the previous or new text is; it only explains pairs computed here.
 */

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

/** Normalised words, without the heading, for content comparison. */
export function contentTokens(provision: Pick<Provision, "text" | "label">): string[] {
  const body = provision.text.startsWith(provision.label) ? provision.text.slice(provision.label.length) : provision.text;
  return normalizeNumbers(normalizeForMatch(body))
    .replace(/[^\p{L}\p{N}%./\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 || /\d/.test(t));
}

/** Dice coefficient over word bigrams (robust to small edits, sensitive to rewrites). */
export function similarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const grams = (tokens: string[]) => {
    const map = new Map<string, number>();
    const list = tokens.length < 2 ? tokens : tokens.slice(1).map((t, i) => `${tokens[i]} ${t}`);
    for (const g of list) map.set(g, (map.get(g) ?? 0) + 1);
    return { map, size: list.length };
  };
  const x = grams(a);
  const y = grams(b);
  if (x.size === 0 || y.size === 0) return 0;
  let overlap = 0;
  for (const [g, n] of x.map) overlap += Math.min(n, y.map.get(g) ?? 0);
  return (2 * overlap) / (x.size + y.size);
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

export type MatchMethod = "number" | "similarity";
export type MatchConfidence = "high" | "medium" | "low";

export interface ProvisionPair {
  a: Provision | null;
  b: Provision | null;
  method: MatchMethod | null;
  similarity: number;
  confidence: MatchConfidence | null;
  /** For unmatched provisions: a plausible counterpart that was not matched, and why. */
  possibleCounterpart: { id: string; label: string; similarity: number } | null;
}

/** Thresholds, exported so the UI can explain them. */
export const MATCH_THRESHOLDS = { strong: 0.5, sameNumberMinimum: 0.2, possible: 0.3 } as const;

/**
 * Pairs provisions of A (previous) and B (new):
 *  1. candidates scored by similarity, with a bonus for the same article number;
 *  2. accepted greedily: strong text similarity, or same number with some overlap;
 *  3. same-number leftovers are paired with low confidence (substantially rewritten);
 *  4. what remains is removed/added, with any plausible counterpart recorded so a
 *     renumbering is never silently shown as a deletion plus an addition.
 */
export function alignProvisions(a: Provision[], b: Provision[]): ProvisionPair[] {
  const tokensA = a.map(contentTokens);
  const tokensB = b.map(contentTokens);
  const sim = a.map((_, i) => b.map((__, j) => similarity(tokensA[i], tokensB[j])));

  const candidates: { i: number; j: number; score: number }[] = [];
  a.forEach((pa, i) =>
    b.forEach((pb, j) => {
      const sameNumber = pa.number !== null && pa.number === pb.number;
      const s = sim[i][j];
      if (s >= MATCH_THRESHOLDS.strong || (sameNumber && s >= MATCH_THRESHOLDS.sameNumberMinimum)) {
        candidates.push({ i, j, score: s + (sameNumber ? 0.25 : 0) });
      }
    }),
  );
  candidates.sort((x, y) => y.score - x.score);

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const pairs = new Map<number, ProvisionPair>(); // keyed by B index (or -1 - A index for removed)

  const pair = (i: number, j: number, method: MatchMethod) => {
    usedA.add(i);
    usedB.add(j);
    const s = sim[i][j];
    const confidence: MatchConfidence = method === "number" ? (s >= MATCH_THRESHOLDS.strong ? "high" : "low") : s >= 0.75 ? "high" : "medium";
    pairs.set(j, { a: a[i], b: b[j], method, similarity: s, confidence, possibleCounterpart: null });
  };

  for (const { i, j } of candidates) {
    if (usedA.has(i) || usedB.has(j)) continue;
    pair(i, j, a[i].number !== null && a[i].number === b[j].number ? "number" : "similarity");
  }
  // Same number, little shared text: likely rewritten in place.
  a.forEach((pa, i) => {
    if (usedA.has(i) || pa.number === null) return;
    const j = b.findIndex((pb, k) => !usedB.has(k) && pb.number === pa.number);
    if (j >= 0) pair(i, j, "number");
  });

  /** Best unmatched-but-plausible counterpart (similarity ≥ possible threshold), for the uncertainty note. */
  const best = (scores: number[], list: Provision[]): ProvisionPair["possibleCounterpart"] => {
    let top: ProvisionPair["possibleCounterpart"] = null;
    for (let k = 0; k < scores.length; k += 1) {
      if (scores[k] >= MATCH_THRESHOLDS.possible && (!top || scores[k] > top.similarity)) {
        top = { id: list[k].id, label: list[k].label, similarity: scores[k] };
      }
    }
    return top;
  };

  b.forEach((pb, j) => {
    if (usedB.has(j)) return;
    pairs.set(j, { a: null, b: pb, method: null, similarity: 0, confidence: null, possibleCounterpart: best(a.map((_, i) => sim[i][j]), a) });
  });

  // Order: by position in B; removed provisions are placed after the B item that follows their A neighbour.
  const ordered: ProvisionPair[] = b.map((_, j) => pairs.get(j)!).filter(Boolean);
  a.forEach((pa, i) => {
    if (usedA.has(i)) return;
    const removed: ProvisionPair = { a: pa, b: null, method: null, similarity: 0, confidence: null, possibleCounterpart: best(sim[i], b) };
    // Insert after the pair holding the previous A provision, if any.
    let at = 0;
    for (let k = i - 1; k >= 0; k -= 1) {
      const index = ordered.findIndex((p) => p.a?.id === a[k].id);
      if (index >= 0) {
        at = index + 1;
        break;
      }
    }
    ordered.splice(at, 0, removed);
  });
  return ordered;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Change types derived from the text. AI-only types are added separately and labelled as such. */
export type DetectedType = "added" | "removed" | "modified" | "renumbered" | "deadline" | "amount" | "definition";

const TIME_UNITS = "(?:يوم|يوما|ايام|أيام|ساعة|ساعات|اسبوع|أسبوع|اسابيع|أسابيع|شهر|شهرا|اشهر|أشهر|سنة|سنوات|عام|اعوام|أعوام|days?|hours?|weeks?|months?|years?)";
const MONEY = "(?:ريال|ريالا|ر\\.س|sar|%|٪|بالمائة|بالمئة|في المائة|دولار|usd)";

/** Numbers attached to a time unit ("30 يومًا", "خلال 15 يوم عمل"), as a sorted multiset. */
export function periodTokens(text: string): string[] {
  const t = arabicNumberWordsToDigits(normalizeNumbers(normalizeForMatch(text)));
  return [...t.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:يوم عمل\\s*)?${TIME_UNITS}`, "giu"))].map((m) => `${m[1]}:${m[0].replace(/[\d.\s]/g, "").slice(0, 3)}`).sort();
}

/** Amounts: numbers with a currency/percent, or large numbers (≥ 1000). */
export function amountTokens(text: string): string[] {
  const t = normalizeNumbers(normalizeForMatch(text));
  const withUnit = [...t.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${MONEY}`, "giu"))].map((m) => m[1]);
  const large = [...t.matchAll(/(?<![\d./])(\d{4,}(?:\.\d+)?)(?![\d/])/g)].map((m) => m[1]).filter((n) => !/^(1[3-5]\d\d|20\d\d|19\d\d)$/.test(n)); // skip years
  return [...new Set([...withUnit, ...large])].sort();
}

const sameList = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);

export interface Classification {
  types: DetectedType[];
  /** Unchanged in substance (identical content, same number). */
  unchanged: boolean;
}

export function classifyPair(pair: Pick<ProvisionPair, "a" | "b">): Classification {
  const { a, b } = pair;
  if (!a && b) return { types: ["added", ...(b.isDefinitions ? (["definition"] as const) : [])], unchanged: false };
  if (a && !b) return { types: ["removed", ...(a.isDefinitions ? (["definition"] as const) : [])], unchanged: false };
  if (!a || !b) return { types: [], unchanged: true };

  const types = new Set<DetectedType>();
  const textChanged = contentTokens(a).join(" ") !== contentTokens(b).join(" ");
  const renumbered = a.number !== b.number;
  if (renumbered) types.add("renumbered");
  if (textChanged) {
    types.add("modified");
    if (!sameList(periodTokens(a.text), periodTokens(b.text))) types.add("deadline");
    if (!sameList(amountTokens(a.text), amountTokens(b.text))) types.add("amount");
    if (a.isDefinitions || b.isDefinitions) types.add("definition");
  }
  return { types: [...types], unchanged: !textChanged && !renumbered };
}

// ---------------------------------------------------------------------------
// Word-level diff for display
// ---------------------------------------------------------------------------

export type DiffPart = { text: string; kind: "same" | "removed" | "added" };

/**
 * Word-level diff (LCS) between two texts, for highlighting inside a modified
 * provision. Returns null when the texts are too long to diff cheaply.
 */
export function wordDiff(previous: string, next: string, maxWords = 800): { previous: DiffPart[]; next: DiffPart[] } | null {
  const x = previous.split(/(\s+)/).filter(Boolean);
  const y = next.split(/(\s+)/).filter(Boolean);
  const wordsX = x.filter((w) => w.trim());
  const wordsY = y.filter((w) => w.trim());
  if (wordsX.length > maxWords || wordsY.length > maxWords) return null;

  const key = (w: string) => normalizeNumbers(normalizeForMatch(w));
  const n = wordsX.length;
  const m = wordsY.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = key(wordsX[i]) === key(wordsY[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const keepX = new Set<number>();
  const keepY = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (key(wordsX[i]) === key(wordsY[j])) {
      keepX.add(i);
      keepY.add(j);
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1;
    else j += 1;
  }

  const build = (tokens: string[], keep: Set<number>, changed: "removed" | "added"): DiffPart[] => {
    const parts: DiffPart[] = [];
    let w = 0;
    for (const token of tokens) {
      const isSpace = !token.trim();
      const kind: DiffPart["kind"] = isSpace ? (parts.at(-1)?.kind ?? "same") : keep.has(w) ? "same" : changed;
      if (!isSpace) w += 1;
      const last = parts.at(-1);
      if (last && last.kind === kind) last.text += token;
      else parts.push({ text: token, kind });
    }
    return parts;
  };
  return { previous: build(x, keepX, "removed"), next: build(y, keepY, "added") };
}
