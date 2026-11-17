import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Bot } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { ContentStudio } from "@/components/tools/legal-content/content-studio";
import { ReviewControls } from "@/components/tools/shared/review-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient, getSessionState } from "@/lib/supabase/server";
import { FORMAT_SPECS } from "@/lib/tools/legal-content/formats";
import { getLegalContent } from "@/lib/tools/legal-content/service";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "المحتوى القانوني" };

interface Props {
  params: Promise<{ outputId: string }>;
}

export default async function LegalContentOutputPage({ params }: Props) {
  const session = await getSessionState();
  if (session.kind !== "authenticated") redirect("/tools/legal-content");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/tools/legal-content");

  const { outputId } = await params;
  const result = await getLegalContent(supabase, outputId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <ErrorState title="تعذّر عرض المحتوى" description={result.error.message} />;
  }
  const { output, content, references } = result.data;
  const spec = FORMAT_SPECS[content.format];
  const quotes = content.cards.flatMap((c) => c.blocks).filter((b) => b.kind === "source_quote").length;
  const missing = content.cards.filter((c) => c.missing).length;

  return (
    <>
      <Link href={`/tools/legal-content?matter=${output.matter_id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        العودة إلى الملف
      </Link>
      <PageHeader
        titleEn={`Legal Content · ${spec.labelEn}`}
        title={output.title}
        description={`${spec.label} · ${content.attribution.sources.length} مصادر · أُنشئ ${formatDateTime(content.generated_at)} · النموذج ${content.model}${content.last_edited_at ? ` · آخر تعديل ${formatDateTime(content.last_edited_at)}` : ""}`}
        actions={<StatusBadge status={output.status} />}
      />
      <div role="note" className="mb-5 flex items-start gap-3 rounded-md border border-analysis/30 bg-analysis-soft px-4 py-3 text-sm leading-6">
        <Bot className="mt-0.5 size-4 shrink-0 text-analysis" aria-hidden />
        <p>
          البنية ثابتة لكل قالب، والنص قابل للتحرير. «نص المصدر» مقتبس حرفيًا من المُدخلات وتحقق الخادم من وجوده؛ «الشرح» كتبه الذكاء الاصطناعي وحُذف منه أي رقم أو مادة أو
          نظام غير وارد في المُدخلات؛ وما تكتبه أنت يُوسم «نص المحامي». لا يُنشر المحتوى قبل مراجعته واعتماده.
        </p>
      </div>
      {content.warnings.length > 0 ? (
        <div role="status" className="mb-5 rounded-md border border-verify/30 bg-verify-soft px-4 py-3 text-sm leading-6">
          <p className="font-semibold">ملاحظات التحقق عند الإعداد</p>
          <ul className="list-disc ps-5">
            {content.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ContentStudio outputId={output.id} content={content} references={references} status={output.status} />

      <Card className="mt-6 max-w-2xl">
        <CardHeader className="block">
          <CardTitle>المراجعة البشرية</CardTitle>
          <CardDescription>مسودة ← بانتظار المراجعة ← تمت المراجعة ← معتمدة. أي تعديل بعد المراجعة يعيد المحتوى إلى مسودة.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReviewControls
            outputId={output.id}
            status={output.status}
            hasDraft
            requiresDraft={false}
            notes={output.review_notes}
            reviewedAt={output.reviewed_at}
            approvedAt={output.approved_at}
            openItems={{ verify: quotes === 0 ? 1 : 0, missing }}
            reviewAcknowledgement="راجعتُ كل اقتباس مقابل المصدر، وتأكدت أن الشرح لا يضيف حكمًا أو مرجعًا غير وارد في المُدخلات، وأن حقل المصدر صحيح"
          />
        </CardContent>
      </Card>
    </>
  );
}
