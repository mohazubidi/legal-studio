import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Bot } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { CaseMapExplorer } from "@/components/tools/casemap/casemap-explorer";
import { createSupabaseServerClient, getSessionState } from "@/lib/supabase/server";
import { findCaseMapItem, parseFilters, parseView } from "@/lib/tools/casemap/explore";
import { getCaseMap } from "@/lib/tools/casemap/service";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "خريطة القضية" };

interface Props {
  params: Promise<{ outputId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CaseMapOutputPage({ params, searchParams }: Props) {
  const session = await getSessionState();
  if (session.kind !== "authenticated") redirect("/tools/casemap");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/tools/casemap");

  const [{ outputId }, query] = await Promise.all([params, searchParams]);
  const result = await getCaseMap(supabase, outputId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <ErrorState title="تعذّر عرض الخريطة" description={result.error.message} />;
  }

  const { output, content, references } = result.data;
  const itemParam = typeof query.item === "string" ? query.item : null;
  const initialItem = itemParam && findCaseMapItem(content, itemParam) ? itemParam : null;
  const initialView = initialItem ? findCaseMapItem(content, initialItem)!.view : parseView(typeof query.view === "string" ? query.view : null);

  return (
    <>
      <Link href={`/tools/casemap?matter=${output.matter_id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        العودة إلى الملف
      </Link>
      <PageHeader
        titleEn="CaseMap · Case intelligence map"
        title={output.title}
        description={`أُنشئت ${formatDateTime(content.generated_at)} · ${content.sources.filter((s) => s.included).length} مصادر · النموذج ${content.model}`}
        actions={<StatusBadge status={output.status} />}
      />
      <div role="note" className="mb-5 flex items-start gap-3 rounded-md border border-analysis/30 bg-analysis-soft px-4 py-3 text-sm leading-6">
        <Bot className="mt-0.5 size-4 shrink-0 text-analysis" aria-hidden />
        <p>
          خريطة منظمة بمساعدة الذكاء الاصطناعي من مصادر الملف فقط. لا تحدد أي طرف محق قانونيًا. الوقائع المستخرجة تحمل إحالات تحقق الخادم من نصها، وتفسيرات الذكاء الاصطناعي
          موسومة بشكل منفصل، وما لا مصدر له موسوم بأنه غير موثّق. اضغط أي عنصر لعرض مصدره.
        </p>
      </div>
      <CaseMapExplorer
        outputId={output.id}
        content={content}
        references={references}
        initialFilters={parseFilters(query, content)}
        initialView={initialView}
        initialItem={initialItem}
      />
    </>
  );
}
