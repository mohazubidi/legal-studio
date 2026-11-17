import "server-only";
import { z } from "zod";
import { articleSegments, librarySourceName, librarySourceText, searchPattern, type LibraryFreshness } from "@/lib/library/format";
import type { AppSupabaseClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/validation/schemas";
import type { DocumentRow, LibraryArticleRow, LibraryLawRow } from "@/types/database";
import { uploadDocument } from "./documents";
import { fail, fromPostgrest, ok, type DataResult } from "./result";

/**
 * Legal Library reads (any signed-in user, RLS) and copying a law, or chosen
 * articles of it, into a matter as a citable source. The library itself is
 * written only by the import script; nothing here can change it.
 */

export const LIBRARY_PAGE_SIZE = 30;

export type LibraryLawSummary = Pick<
  LibraryLawRow,
  "id" | "title" | "category" | "issued_on" | "amended_on" | "status" | "article_count" | "fetched_at"
>;
const SUMMARY_COLUMNS = "id, title, category, issued_on, amended_on, status, article_count, fetched_at";

export interface LibraryListing {
  laws: LibraryLawSummary[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listLibraryLaws(
  supabase: AppSupabaseClient,
  options: { query?: string; category?: string; page?: number } = {},
): Promise<DataResult<LibraryListing>> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const from = (page - 1) * LIBRARY_PAGE_SIZE;
  let query = supabase.from("library_laws").select(SUMMARY_COLUMNS, { count: "exact" });
  const pattern = options.query ? searchPattern(options.query) : null;
  if (pattern) query = query.ilike("search_title", pattern);
  if (options.category) query = query.eq("category", options.category.slice(0, 200));
  const { data, error, count } = await query.order("title").range(from, from + LIBRARY_PAGE_SIZE - 1);
  if (error) return fromPostgrest(error, "listLibraryLaws");
  const total = count ?? data.length;
  return ok({ laws: data, total, page, pageCount: Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE)) });
}

export interface ArticleHit {
  lawId: string;
  lawTitle: string;
  position: number;
  label: string;
  text: string;
}

/** Articles whose text contains the term (normalized), for the library search. */
export async function searchLibraryArticles(supabase: AppSupabaseClient, term: string, limit = 20): Promise<DataResult<ArticleHit[]>> {
  const pattern = searchPattern(term);
  if (!pattern) return ok([]);
  const { data, error } = await supabase
    .from("library_articles")
    .select("law_id, position, label, text, law:library_laws(title)")
    .ilike("search_text", pattern)
    .order("law_id")
    .order("position")
    .limit(limit);
  if (error) return fromPostgrest(error, "searchLibraryArticles");
  return ok(
    data.map((row) => ({
      lawId: row.law_id,
      lawTitle: (row.law as { title: string } | null)?.title ?? "",
      position: row.position,
      label: row.label,
      text: row.text,
    })),
  );
}

export interface LibraryLawWithArticles {
  law: LibraryLawRow;
  articles: Pick<LibraryArticleRow, "position" | "label" | "text">[];
}

export async function getLibraryLaw(supabase: AppSupabaseClient, lawId: string): Promise<DataResult<LibraryLawWithArticles>> {
  if (!uuidSchema.safeParse(lawId).success) return fail("not_found", "النظام غير موجود في المكتبة.");
  const { data: law, error } = await supabase.from("library_laws").select("*").eq("id", lawId).maybeSingle();
  if (error) return fromPostgrest(error, "getLibraryLaw");
  if (!law) return fail("not_found", "النظام غير موجود في المكتبة.");
  const articles = await readArticles(supabase, lawId);
  if (!articles.ok) return articles;
  return ok({ law, articles: articles.data });
}

/** PostgREST caps a response at its max-rows setting (1000 on Supabase), so read in pages. */
async function readArticles(
  supabase: AppSupabaseClient,
  lawId: string,
  positions?: readonly number[],
): Promise<DataResult<Pick<LibraryArticleRow, "position" | "label" | "text">[]>> {
  const rows: Pick<LibraryArticleRow, "position" | "label" | "text">[] = [];
  const PAGE = 500;
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from("library_articles").select("position, label, text").eq("law_id", lawId);
    if (positions) query = query.in("position", [...positions]);
    const { data, error } = await query.order("position").range(from, from + PAGE - 1);
    if (error) return fromPostgrest(error, "readArticles");
    rows.push(...data);
    if (data.length < PAGE) return ok(rows);
  }
}

export const addLibrarySourceSchema = z.object({
  matterId: uuidSchema,
  lawId: uuidSchema,
  /** Article positions; omitted means the whole law. */
  positions: z.array(z.number().int().min(1)).min(1, "اختر مادة واحدة على الأقل.").max(5000).optional(),
});

/**
 * Copies a law (or chosen articles) into the matter as a processed `legal_text`
 * source with one citable segment per article, recording the law and the
 * version of its text. The copy is the matter's own: later library updates do
 * not change it, they only flag it as outdated.
 */
export async function addLibrarySource(
  supabase: AppSupabaseClient,
  input: z.input<typeof addLibrarySourceSchema>,
): Promise<DataResult<DocumentRow>> {
  const parsed = addLibrarySourceSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input", parsed.error.issues[0]?.message ?? "بيانات غير صالحة.");
  const { matterId, lawId } = parsed.data;
  const positions = parsed.data.positions ? [...new Set(parsed.data.positions)].sort((a, b) => a - b) : undefined;

  const { data: law, error } = await supabase
    .from("library_laws")
    .select("id, title, source_url, fetched_at, amended_on, status, content_hash, article_count")
    .eq("id", lawId)
    .maybeSingle();
  if (error) return fromPostgrest(error, "addLibrarySource.law");
  if (!law) return fail("not_found", "النظام غير موجود في المكتبة.");

  const articles = await readArticles(supabase, lawId, positions);
  if (!articles.ok) return articles;
  if (articles.data.length === 0 || (positions && articles.data.length !== positions.length)) {
    return fail("invalid_input", "بعض المواد المختارة غير موجودة في هذا النظام.");
  }

  // The import replaces a law's articles atomically; if it ran between the two
  // reads, the articles may not match the recorded version. Check and refuse.
  const { data: after, error: afterError } = await supabase.from("library_laws").select("content_hash").eq("id", lawId).maybeSingle();
  if (afterError) return fromPostgrest(afterError, "addLibrarySource.recheck");
  if (!after || after.content_hash !== law.content_hash) {
    return fail("conflict", "تحدّث نص النظام في المكتبة أثناء الإضافة. أعد المحاولة.");
  }

  const partial = articles.data.length < law.article_count;
  const text = librarySourceText(law, articles.data);
  const file = new File([text], librarySourceName(law.title, partial), { type: "text/plain" });
  return uploadDocument(supabase, {
    matterId,
    file,
    sourceKind: "legal_text",
    segments: articleSegments(articles.data),
    library: { lawId: law.id, version: law.content_hash },
  });
}

/**
 * For matter sources copied from the library: whether the law's text changed
 * (or the law was removed) since the copy was made. Other sources are omitted.
 */
export async function libraryFreshness(
  supabase: AppSupabaseClient,
  documents: readonly Pick<DocumentRow, "id" | "library_law_id" | "library_version">[],
): Promise<Record<string, LibraryFreshness>> {
  const linked = documents.filter((d) => d.library_version);
  if (linked.length === 0) return {};
  const lawIds = [...new Set(linked.map((d) => d.library_law_id).filter((id): id is string => Boolean(id)))];
  const hashes = new Map<string, string>();
  if (lawIds.length > 0) {
    const { data, error } = await supabase.from("library_laws").select("id, content_hash").in("id", lawIds);
    if (error) {
      console.error("[data] libraryFreshness:", error.message);
      return {};
    }
    for (const row of data) hashes.set(row.id, row.content_hash);
  }
  const result: Record<string, LibraryFreshness> = {};
  for (const doc of linked) {
    const current = doc.library_law_id ? hashes.get(doc.library_law_id) : undefined;
    result[doc.id] = current === undefined ? "removed" : current === doc.library_version ? "current" : "changed";
  }
  return result;
}
