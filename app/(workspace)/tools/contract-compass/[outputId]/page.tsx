import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Bot } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { ContractCompassView, parseContractView } from "@/components/tools/contract-compass/contract-view";
import { ReviewControls } from "@/components/tools/shared/review-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient, getSessionState } from "@/lib/supabase/server";
import { getContractCompass } from "@/lib/tools/contract-compass/service";
import { buildContractView, findContractItem } from "@/lib/tools/contract-compass/view";
import { parseReviewMarks } from "@/lib/tools/shared/review";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "بوصلة العقود" };

interface Props {
  params: Promise<{ outputId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ContractOutputPage({ params, searchParams }: Props) {
  const session = await getSessionState();
  if (session.kind !== "authenticated") redirect("/tools/contract-compass");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/tools/contract-compass");

  const [{ outputId }, query] = await Promise.all([params, searchParams]);
  const result = await getContractCompass(supabase, outputId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <ErrorState title="تعذّر عرض تحليل العقد" description={result.error.message} />;
  }

  const { output, content, references } = result.data;
  const marks = parseReviewMarks(output.review_marks);
  const model = buildContractView(content, references);
  const itemParam = typeof query.item === "string" ? query.item : null;
  const initialItem = itemParam && findContractItem(model, itemParam) ? itemParam : null;
  const unverified = model.terms.filter((t) => t.status === "unverified").length + model.matrix.filter((o) => !o.referenced).length;
  const needsChange = Object.values(marks).filter((m) => m.status === "needs_change").length;

  return (
    <>
      <Link href={`/tools/contract-compass?matter=${output.matter_id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        العودة إلى الملف
      </Link>
      <PageHeader
        titleEn="Contract Compass · Operational contract view"
        title={output.title}
        description={`العقد: ${content.contract.file_name} · أُنشئ ${formatDateTime(content.generated_at)} · النموذج ${content.model}`}
        actions={<StatusBadge status={output.status} />}
      />
      <div role="note" className="mb-5 flex items-start gap-3 rounded-md border border-analysis/30 bg-analysis-soft px-4 py-3 text-sm leading-6">
        <Bot className="mt-0.5 size-4 shrink-0 text-analysis" aria-hidden />
        <p>
          ما يظهر بوصفه «منصوصًا عليه» مستخرج من نص العقد ومرتبط بالبند والصفحة. الملاحظات في «بنود تستحق المراجعة» تفسير آلي بصياغة غير قاطعة. لا يُستنتج أي تاريخ أو مبلغ
          أو التزام أو قانون حاكم غير وارد في العقد. اضغط أي عنصر لعرض مصدره وتسجيل مراجعتك.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <ContractCompassView
          outputId={output.id}
          content={content}
          references={references}
          reviewMarks={marks}
          initialView={parseContractView(typeof query.view === "string" ? query.view : null)}
          initialItem={initialItem}
        />
        <Card className="h-fit xl:sticky xl:top-24">
          <CardHeader className="block">
            <CardTitle>المراجعة البشرية</CardTitle>
            <CardDescription>
              {Object.keys(marks).length} عنصرًا عليه علامة مراجعة{needsChange > 0 ? `، منها ${needsChange} يحتاج تصحيحًا` : ""}.
            </CardDescription>
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
              openItems={{ verify: unverified, missing: model.missing.length }}
              reviewAcknowledgement="راجعتُ الأطراف والشروط والالتزامات والمواعيد والشروط المالية مقابل نص العقد"
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
