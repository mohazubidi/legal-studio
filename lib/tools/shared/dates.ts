import type { StatedDate } from "./model-date";

export type DatePrecision = "day" | "month" | "year";

export interface NormalizedDate {
  /** As written in the source. */
  text: string;
  calendar: "gregorian" | "hijri" | "unknown";
  /** Gregorian ISO date (yyyy-mm-dd) used for sorting and the timeline; null when undated. */
  iso: string | null;
  precision: DatePrecision | null;
  /** True when iso was computed from a Hijri date (Umm al-Qura), not stated in the source. */
  converted: boolean;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function isValidGregorian(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const hijriFormatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function hijriParts(date: Date): { y: number; m: number; d: number } {
  const parts = hijriFormatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/**
 * Converts an Umm al-Qura Hijri date to Gregorian with the platform calendar,
 * by estimating and correcting against Intl. Returns null for impossible dates.
 */
export function hijriToGregorian(y: number, m: number, d: number): string | null {
  if (y < 1300 || y > 1600 || m < 1 || m > 12 || d < 1 || d > 30) return null;
  // Approximate: 1 Muharram 1 AH ≈ 622-07-16; mean Hijri year ≈ 354.367 days.
  const approx = Date.UTC(622, 6, 16) + ((y - 1) * 354.367 + (m - 1) * 29.53 + (d - 1)) * 86_400_000;
  for (let offset = -40; offset <= 40; offset += 1) {
    const candidate = new Date(approx + offset * 86_400_000);
    const parts = hijriParts(candidate);
    if (parts.y === y && parts.m === m && parts.d === d) {
      return `${candidate.getUTCFullYear()}-${pad(candidate.getUTCMonth() + 1)}-${pad(candidate.getUTCDate())}`;
    }
  }
  return null;
}

/** Turns a stated date into a sortable one, without guessing missing parts. */
export function normalizeStatedDate(date: StatedDate): NormalizedDate {
  const text = date.text.trim();
  const base = { text, calendar: date.calendar, iso: null, precision: null, converted: false } satisfies NormalizedDate;
  const { year, month, day } = date;
  if (date.calendar === "unknown" || year <= 0) return base;

  const precision: DatePrecision = month >= 1 && month <= 12 ? (day >= 1 && day <= 31 ? "day" : "month") : "year";

  if (date.calendar === "gregorian") {
    if (year < 1800 || year > 2200) return base;
    const m = precision === "year" ? 1 : month;
    const d = precision === "day" ? day : 1;
    if (!isValidGregorian(year, m, d)) return base;
    return { ...base, iso: `${pad(year, 4)}-${pad(m)}-${pad(d)}`, precision };
  }

  const iso = hijriToGregorian(year, precision === "year" ? 1 : month, precision === "day" ? day : 1);
  return iso ? { ...base, iso, precision, converted: true } : base;
}
