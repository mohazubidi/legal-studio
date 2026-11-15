import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { RegDeltaView } from "@/components/tools/regdelta/regdelta-view";
import { ReviewControls } from "@/components/tools/shared/review-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createSupabaseServerClient, getSessionState } from "@/lib/supabase/server";
import { getRegDelta } from "@/lib/tools/regdelta/service";
import { parseChangeParams } from "@/lib/tools/regdelta/view";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "مقارنة التعديلات التنظيمية" };

interface Props {
  params: Promise<{ outputId: string }>;
  searchParams: Promise<{ change?: string | string[]; side?: string | string[] }>;
}

export default async function RegDeltaOutputPage({ params, searchParams }: Props) {
  const session = await getSessionState();
  if (session.kind !== "authenticated") redirect("/tools/regdelta");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/tools/regdelta");

  const [{ outputId }, query] = await Promise.all([params, searchParams]);
  const result = await getRegDelta(supabase, outputId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <ErrorState title="تعذّر عرض المقارنة" description={result.error.message} />;
  }
  const { output, content, references } = result.data;
  const deepLink = parseChangeParams(query, content);
  const uncertain = content.changes.filter((c) => c.uncertainty && !c.excluded).length;

  return (
    <>
      <Link href={`/tools/regdelta?matter=${output.matter_id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        العودة إلى الملف
      </Link>
      <PageHeader
        titleEn="RegDelta · Regulatory change comparison"
        title={output.title}
        description={`أُنشئت ${formatDateTime(content.generated_at)}${content.last_edited_at ? ` · آخر تحرير ${formatDateTime(content.last_edited_at)}` : ""} · النموذج ${content.model}`}
        actions={<StatusBadge status={output.status} />}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <RegDeltaView outputId={output.id} content={content} references={references} initialChange={deepLink.change} initialSide={deepLink.side} />
        <Card className="h-fit xl:sticky xl:top-24">
          <CardHeader className="block">
            <CardTitle>المراجعة البشرية</CardTitle>
            <CardDescription>حرّر المقارنة واحفظها، ثم أرسلها للمراجعة. أي تعديل لاحق يعيدها إلى مسودة.</CardDescription>
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
              openItems={{ verify: uncertain, missing: 0 }}
              reviewAcknowledgement="راجعتُ التغييرات ومطابقة المواد بين النسختين والأثر التشغيلي وقائمة الامتثال مقابل النصين"
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
