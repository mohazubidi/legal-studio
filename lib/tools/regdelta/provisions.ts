import { normalizeForMatch, type IndexedSource } from "@/lib/tools/shared/citations";
import { normalizeNumbers } from "@/lib/tools/shared/numbers";

/**
 * Splits a regulation into provisions (articles) so versions can be compared
 * structurally. Deterministic: no model involved. Each provision keeps the
 * pages/sections it spans, so both versions can be cited precisely.
 */
export interface Provision {
  /** Stable id within the comparison: "A3", "B7". */
  id: string;
  /** Normalised article number ("5", "5/2") or null for unnumbered text. */
  number: string | null;
  /** Heading as written, e.g. "المادة الخامسة" or "Article 5". */
  label: string;
  /** Verbatim provision text (heading included). */
  text: string;
  /** Segments (pages/sections) the provision spans, in order. */
  segmentIds: string[];
  /** Human location, e.g. "صفحة 2" or "صفحة 2–3". */
  location: string;
  /** True for definitions provisions (by heading or wording). */
  isDefinitions: boolean;
}

const UNITS: Record<string, number> = {
  الاولى: 1, الأولى: 1, الحادية: 1, الحادي: 1, الثانية: 2, الثاني: 2, الثالثة: 3, الثالث: 3, الرابعة: 4, الرابع: 4,
  الخامسة: 5, الخامس: 5, السادسة: 6, السادس: 6, السابعة: 7, السابع: 7, الثامنة: 8, الثامن: 8, التاسعة: 9, التاسع: 9,
};
const TENS: Record<string, number> = { العاشرة: 10, العاشر: 10, العشرون: 20, العشرين: 20, الثلاثون: 30, الثلاثين: 30, الاربعون: 40, الأربعون: 40, الاربعين: 40, الأربعين: 40, الخمسون: 50, الخمسين: 50, الستون: 60, الستين: 60, السبعون: 70, السبعين: 70, الثمانون: 80, الثمانين: 80, التسعون: 90, التسعين: 90 };
const HUNDREDS: Record<string, number> = { المائة: 100, المئة: 100 };

/** Parses Arabic ordinal article names ("الخامسة", "الحادية عشرة", "الثالثة والعشرون", "المائة") into numbers. */
export function parseArabicOrdinal(words: string): number | null {
  const tokens = normalizeForMatch(words).split(/\s+/).filter(Boolean);
  let total = 0;
  let matched = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const raw = tokens[i];
    const token = raw.startsWith("وال") ? raw.slice(1) : raw;
    if (token === "عشرة" || token === "عشر") {
      total += 10;
      matched += 1;
    } else if (UNITS[token] !== undefined) {
      total += UNITS[token];
      matched += 1;
    } else if (TENS[token] !== undefined) {
      total += TENS[token];
      matched += 1;
    } else if (HUNDREDS[token] !== undefined) {
      total += HUNDREDS[token];
      matched += 1;
    } else if (token === "بعد") {
      continue;
    } else {
      break;
    }
  }
  return matched > 0 && total > 0 ? total : null;
}

const ORDINAL_WORD =
  "(?:و?ال(?:أولى|اولى|حادية|حادي|ثانية|ثاني|ثالثة|ثالث|رابعة|رابع|خامسة|خامس|سادسة|سادس|سابعة|سابع|ثامنة|ثامن|تاسعة|تاسع|عاشرة|عاشر|عشرون|عشرين|ثلاثون|ثلاثين|أربعون|اربعون|أربعين|اربعين|خمسون|خمسين|ستون|ستين|سبعون|سبعين|ثمانون|ثمانين|تسعون|تسعين|مائة|مئة)|عشرة|عشر|بعد)";

/**
 * A provision heading at the start of a line: a keyword, then a number in
 * digits (optionally in brackets, with sub-numbering) or an Arabic ordinal.
 */
const HEADING = new RegExp(
  `^[ \\t]*((?:المادة|مادة|البند|Article|ARTICLE|Art\\.)\\s*(?:[\\(\\[]\\s*)?(?:([0-9٠-٩]+(?:\\s*[./\\-]\\s*[0-9٠-٩]+)*)|(${ORDINAL_WORD}(?:\\s+${ORDINAL_WORD}){0,3}))(?:\\s*[\\)\\]])?)`,
  "gmu",
);

interface Located {
  text: string;
  /** For each character, the segment it came from. */
  segmentAt: (offset: number) => number;
}

function concatenate(source: IndexedSource): Located {
  const starts: number[] = [];
  let text = "";
  for (const segment of source.segments) {
    starts.push(text.length);
    text += `${segment.text}\n`;
  }
  return {
    text,
    segmentAt: (offset) => {
      let index = 0;
      for (let i = 0; i < starts.length; i += 1) if (starts[i] <= offset) index = i;
      return index;
    },
  };
}

const DEFINITIONS = [/تعريفات/, /التعريفات/, /يقصد\s*ب/, /يُقصد\s*ب/, /\bdefinitions?\b/i, /\bshall\s+mean\b/i];

function locationOf(source: IndexedSource, indexes: number[]): string {
  const labels = [...new Set(indexes.map((i) => source.segments[i].label))];
  return labels.length === 1 ? labels[0] : `${labels[0]}–${labels[labels.length - 1].replace(/^\D+/, "")}`;
}

/**
 * Splits a source into provisions. Text before the first heading becomes a
 * preamble provision. When no headings are found, each segment becomes an
 * unnumbered provision (matching then relies on text similarity alone).
 */
export function splitProvisions(source: IndexedSource, side: "A" | "B"): { provisions: Provision[]; numbered: boolean } {
  const { text, segmentAt } = concatenate(source);
  const headings: { index: number; label: string; number: string | null }[] = [];
  for (const match of text.matchAll(HEADING)) {
    const label = match[1].trim();
    const digits = match[2] ? normalizeNumbers(match[2]).replace(/\s+/g, "").replace(/[.\-]/g, "/") : null;
    const ordinal = match[3] ? parseArabicOrdinal(match[3]) : null;
    const number = digits ?? (ordinal !== null ? String(ordinal) : null);
    if (number === null) continue;
    headings.push({ index: (match.index ?? 0) + match[0].indexOf(match[1]), label, number });
  }

  const make = (n: number, start: number, end: number, label: string, number: string | null): Provision | null => {
    const body = text.slice(start, end).trim();
    if (!body) return null;
    const first = segmentAt(start);
    const last = segmentAt(Math.max(start, end - 2));
    const indexes = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    return {
      id: `${side}${n}`,
      number,
      label,
      text: body,
      segmentIds: indexes.map((i) => source.segments[i].id),
      location: locationOf(source, indexes),
      isDefinitions: DEFINITIONS.some((pattern) => pattern.test(label) || pattern.test(body.slice(0, 400))),
    };
  };

  if (headings.length === 0) {
    const provisions = source.segments
      .map((segment, i) => ({
        id: `${side}${i + 1}`,
        number: null,
        label: segment.label,
        text: segment.text.trim(),
        segmentIds: [segment.id],
        location: segment.label,
        isDefinitions: DEFINITIONS.some((pattern) => pattern.test(segment.text.slice(0, 400))),
      }))
      .filter((p) => p.text);
    return { provisions, numbered: false };
  }

  const provisions: Provision[] = [];
  const preamble = make(0, 0, headings[0].index, "الديباجة", null);
  if (preamble && preamble.text.length > 20) provisions.push(preamble);
  headings.forEach((heading, i) => {
    const provision = make(provisions.length + 1, heading.index, headings[i + 1]?.index ?? text.length, heading.label, heading.number);
    if (provision) provisions.push(provision);
  });
  return { provisions, numbered: true };
}
