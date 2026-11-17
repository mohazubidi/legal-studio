import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Search, X } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { LawStatus, LibraryNotice } from "@/components/library/law-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listLibraryLaws, searchLibraryArticles } from "@/lib/data/library";
import { workspaceSource } from "@/lib/data/workspace";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "مكتبة الأنظمة" };

type SearchParams = Promise<{ q?: string | string[]; category?: string | string[]; page?: string | string[] }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function href(params: { q?: string; category?: string; page?: number }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category) search.set("category", params.category);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const query = search.toString();
  return query ? `/library?${query}` : "/library";
}

function excerpt(text: string, max = 220): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export default async function LibraryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const q = first(params.q)?.slice(0, 100);
  const category = first(params.category);
  const page = Math.max(1, Number(first(params.page)) || 1);

  const header = (
    <PageHeader
      titleEn="Legal Library"
      title="مكتبة الأنظمة"
      description="الأنظمة واللوائح بنصوصها ومصدرها الرسمي. ابحث في العناوين والمواد، وأضف النظام أو مواد منه إلى قضية لتُستخدم مصدرًا في الأدوات مع الإحالة إلى المادة."
    />
  );

  const source = await workspaceSource();
  if (source.kind === "preview") {
    return (
      <>
        {header}
        <EmptyState icon={BookOpen} title="المكتبة تتطلب قاعدة البيانات" description="اضبط Supabase لعرض الأنظمة المستوردة." />
      </>
    );
  }

  const [listing, hits] = await Promise.all([
    listLibraryLaws(source.supabase, { query: q, category, page }),
    q && page === 1 ? searchLibraryArticles(source.supabase, q) : Promise.resolve(null),
  ]);

  return (
    <>
      {header}
      <div className="space-y-6">
        <form action="/library" role="search" className="flex flex-col gap-2 sm:flex-row">
          {category ? <input type="hidden" name="category" value={category} /> : null}
          <label htmlFor="library-q" className="sr-only">
            ابحث في المكتبة
          </label>
          <Input id="library-q" name="q" defaultValue={q} maxLength={100} placeholder="ابحث باسم النظام أو بكلمة من نص المادة" className="sm:max-w-md" />
          <Button type="submit">
            <Search aria-hidden />
            بحث
          </Button>
        </form>

        {category ? (
          <p className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">التصنيف:</span>
            <span className="font-medium">{category}</span>
            <Link href={href({ q })} className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline">
              <X className="size-3.5" aria-hidden />
              إزالة
            </Link>
          </p>
        ) : null}

        <LibraryNotice />

        {!listing.ok ? (
          <ErrorState title="تعذّر تحميل المكتبة" description={listing.error.message} />
        ) : listing.data.total === 0 && !q && !category ? (
          <EmptyState
            icon={BookOpen}
            title="المكتبة فارغة"
            description="تُضاف الأنظمة بسكربت الاستيراد من جهاز المشرف (npm run library:import). لا يمكن إضافة الأنظمة أو تعديلها من الموقع."
          />
        ) : (
          <section aria-labelledby="laws-heading" className="space-y-3">
            <h2 id="laws-heading" className="text-sm font-semibold">
              {q || category ? "الأنظمة المطابقة" : "الأنظمة"} <span className="tabular font-normal text-muted-foreground">({listing.data.total})</span>
            </h2>
            {listing.data.laws.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد نظام بهذا الاسم.</p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border bg-surface">
                {listing.data.laws.map((law) => (
                  <li key={law.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/library/${law.id}`} className="font-medium underline-offset-4 hover:underline">
                        {law.title}
                      </Link>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {law.category ? (
                          <>
                            <Link href={href({ category: law.category })} className="underline-offset-4 hover:underline">
                              {law.category}
                            </Link>
                            {" · "}
                          </>
                        ) : null}
                        <span className="tabular">{law.article_count}</span> مادة
                        {law.issued_on ? ` · صدر ${law.issued_on}` : ""}
                        {law.amended_on ? ` · آخر تعديل ${law.amended_on}` : ""}
                        {` · جُلب ${formatDate(law.fetched_at)}`}
                      </p>
                    </div>
                    <LawStatus status={law.status} />
                  </li>
                ))}
              </ul>
            )}
            {listing.data.pageCount > 1 ? (
              <nav aria-label="الصفحات" className="flex items-center justify-between text-sm">
                {page > 1 ? (
                  <Link href={href({ q, category, page: page - 1 })} className="underline-offset-4 hover:underline">
                    السابق
                  </Link>
                ) : (
                  <span />
                )}
                <span className="tabular text-muted-foreground">
                  صفحة {page} من {listing.data.pageCount}
                </span>
                {page < listing.data.pageCount ? (
                  <Link href={href({ q, category, page: page + 1 })} className="underline-offset-4 hover:underline">
                    التالي
                  </Link>
                ) : (
                  <span />
                )}
              </nav>
            ) : null}
          </section>
        )}

        {hits ? (
          <section aria-labelledby="articles-heading" className="space-y-3">
            <h2 id="articles-heading" className="text-sm font-semibold">
              مواد يرد فيها «{q}»
            </h2>
            {!hits.ok ? (
              <ErrorState title="تعذّر البحث في المواد" description={hits.error.message} />
            ) : hits.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد مادة تطابق البحث.</p>
            ) : (
              <ul className="space-y-2">
                {hits.data.map((hit) => (
                  <li key={`${hit.lawId}-${hit.position}`} className="rounded-md border border-border bg-surface px-4 py-3">
                    <Link href={`/library/${hit.lawId}#a-${hit.position}`} className="text-sm font-medium underline-offset-4 hover:underline">
                      {hit.lawTitle} · {hit.label}
                    </Link>
                    <p className="mt-1 text-sm leading-7 text-muted-foreground">{excerpt(hit.text)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </>
  );
}
