import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { IntakeBrief } from "@/components/tools/matter-intake/brief";
import { createSupabaseServerClient, getSessionState } from "@/lib/supabase/server";
import { getIntakeBrief } from "@/lib/tools/matter-intake/service";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "ملخص الاستقبال" };

export default async function IntakeBriefPage({ params }: { params: Promise<{ outputId: string }> }) {
  const session = await getSessionState();
  if (session.kind !== "authenticated") redirect("/tools/matter-intake");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/tools/matter-intake");

  const { outputId } = await params;
  const result = await getIntakeBrief(supabase, outputId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <ErrorState title="تعذّر عرض الملخص" description={result.error.message} />;
  }
  const { output, content, references } = result.data;
  return (
    <>
      <Link href={`/tools/matter-intake/${output.matter_id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        العودة إلى الاستقبال
      </Link>
      <PageHeader
        titleEn="Matter Brief"
        title={output.title}
        description={`أُنشئ ${formatDateTime(content.generated_at)}${content.last_edited_at ? ` · آخر تحرير ${formatDateTime(content.last_edited_at)}` : ""} · النموذج ${content.model}`}
        actions={<StatusBadge status={output.status} />}
      />
      <IntakeBrief outputId={output.id} content={content} references={references} />
    </>
  );
}
