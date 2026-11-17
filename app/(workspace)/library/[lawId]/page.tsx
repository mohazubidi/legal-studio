import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { AddToMatter } from "@/components/library/add-to-matter";
import { LawStatus, LibraryNotice } from "@/components/library/law-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getLibraryLaw } from "@/lib/data/library";
import { listMatters } from "@/lib/data/matters";
import { workspaceSource } from "@/lib/data/workspace";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "نظام — مكتبة الأنظمة" };

export default async function LibraryLawPage({ params }: { params: Promise<{ lawId: string }> }) {
  const { lawId } = await params;
  const source = await workspaceSource();
  if (source.kind === "preview") notFound();

  const [result, matters] = await Promise.all([getLibraryLaw(source.supabase, lawId), listMatters(source.supabase)]);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <ErrorState title="تعذّر تحميل النظام" description={result.error.message} />;
  }
  const { law, articles } = result.data;

  const facts: [string, string | null][] = [
    ["التصنيف", law.category],
    ["أداة الإصدار", law.instrument],
    ["تاريخ الإصدار", law.issued_on],
    ["آخر تعديل مذكور في المصدر", law.amended_on],
    ["تاريخ الجلب", formatDateTime(law.fetched_at)],
  ];

  return (
    <>
      <Link href="/library" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
        <ArrowRight className="size-4" aria-hidden />
        مكتبة الأنظمة
      </Link>
      <PageHeader titleEn="Legal Library" title={law.title} actions={<LawStatus status={law.status} />} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {facts
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">المصدر الرسمي</dt>
              <dd>
                <a href={law.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all underline underline-offset-4" dir="ltr">
                  {law.source_url}
                  <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                </a>
              </dd>
            </div>
          </dl>

          <LibraryNotice />

          <section aria-labelledby="articles-heading">
            <h2 id="articles-heading" className="mb-3 text-sm font-semibold">
              المواد <span className="tabular font-normal text-muted-foreground">({articles.length})</span>
            </h2>
            <ol className="space-y-4">
              {articles.map((article) => (
                <li key={article.position} id={`a-${article.position}`} className="scroll-mt-20 rounded-md border border-border bg-surface px-4 py-3 target:border-primary">
                  <h3 className="mb-1 text-sm font-semibold">{article.label}</h3>
                  <p className="whitespace-pre-line text-sm leading-7">{article.text}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">إضافة إلى قضية</CardTitle>
            </CardHeader>
            <CardContent>
              {matters.ok ? (
                <AddToMatter
                  lawId={law.id}
                  lawTitle={law.title}
                  repealed={law.status === "repealed"}
                  articles={articles.map((a) => ({ position: a.position, label: a.label }))}
                  matters={matters.data.map((m) => ({ id: m.id, name: m.matter_name }))}
                />
              ) : (
                <p className="text-sm text-danger">{matters.error.message}</p>
              )}
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                تُحفظ نسخة من النص مع القضية، وتُقتبس منها الأدوات مع الإحالة إلى المادة. إذا تغيّر النص في المكتبة لاحقًا، تبقى النسخة كما هي ويظهر تنبيه بجانبها.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
