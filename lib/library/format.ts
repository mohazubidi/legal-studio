import { z } from "zod";
import type { DocumentSegment, LibraryLawStatus } from "@/types/database";

/**
 * The Legal Library's import format and the helpers shared by the app and the
 * import script. One file describes one law with all its articles, in order.
 * The text is stored exactly as given (trimmed); nothing here rewrites it.
 */

/** A matter source copied from the library, compared with the library now. */
export type LibraryFreshness = "current" | "changed" | "removed";

export const LIBRARY_STATUSES = ["in_force", "repealed", "unknown"] as const;

export const LIBRARY_STATUS_LABELS: Record<LibraryLawStatus, string> = {
  in_force: "ساري",
  repealed: "ملغى",
  unknown: "الحالة غير محددة",
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const libraryArticleSchema = z.object({
  label: z.string().trim().min(1, "عنوان المادة فارغ.").max(200),
  text: z.string().trim().min(1, "نص المادة فارغ.").max(100_000),
});

export const libraryLawSchema = z
  .object({
    source: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,39}$/)
      .default("boe"),
    external_id: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(500),
    category: optionalText(200),
    instrument: optionalText(1000),
    issued_on: optionalText(100),
    amended_on: optionalText(100),
    status: z.enum(LIBRARY_STATUSES).default("unknown"),
    source_url: z
      .string()
      .trim()
      .max(2000)
      .url()
      .refine((u) => u.startsWith("https://"), "رابط المصدر يجب أن يبدأ بـ https://"),
    fetched_at: z.string().datetime({ offset: true }),
    articles: z.array(libraryArticleSchema).min(1, "النظام بلا مواد.").max(5000),
  })
  .strict()
  .superRefine((law, ctx) => {
    const seen = new Set<string>();
    law.articles.forEach((article, index) => {
      if (seen.has(article.label)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["articles", index, "label"], message: `عنوان مادة مكرر: ${article.label}` });
      }
      seen.add(article.label);
    });
  });

export type LibraryLawInput = z.input<typeof libraryLawSchema>;
export type LibraryLaw = z.output<typeof libraryLawSchema>;

/**
 * Same normalization as public.library_normalize(): drop Arabic diacritics and
 * tatweel, unify alef forms, alef maqsura → ya, ta marbuta → ha, collapse
 * whitespace, lower-case. Search terms must go through this so they match.
 */
export function normalizeSearch(text: string): string {
  return text
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

/** A search term for an ILIKE pattern: normalized, wildcards escaped, bounded. */
export function searchPattern(query: string): string | null {
  const term = normalizeSearch(query).slice(0, 100);
  if (term.length < 2) return null;
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Article segments for a matter source: one citable segment per article. */
export function articleSegments(articles: readonly { position: number; label: string; text: string }[]): DocumentSegment[] {
  return articles.map((a) => ({ id: `a${a.position}`, label: a.label, text: a.text }));
}

/** The plain-text copy stored with the matter source (and downloadable from it). */
export function librarySourceText(
  law: { title: string; source_url: string; fetched_at: string; amended_on: string | null },
  articles: readonly { label: string; text: string }[],
): string {
  const header = [
    law.title,
    `المصدر: ${law.source_url}`,
    `تاريخ الجلب: ${law.fetched_at.slice(0, 10)}`,
    law.amended_on ? `آخر تعديل مذكور في المصدر: ${law.amended_on}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return `${header}\n\n${articles.map((a) => `${a.label}\n${a.text}`).join("\n\n")}\n`;
}

/** File name of a library source: the law's title, safe for storage, within limits. */
export function librarySourceName(title: string, partial: boolean): string {
  const base = title.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 200);
  return `${base}${partial ? " (مواد مختارة)" : ""}.txt`;
}
