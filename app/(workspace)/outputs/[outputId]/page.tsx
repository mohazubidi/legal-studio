import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AIResultPanel } from "@/components/legal/ai-result-panel";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { getToolName } from "@/config/tools";
import { getMatter, getOutput } from "@/data/mock";
import { getOutput as getStoredOutput } from "@/lib/data/outputs";
import { workspaceSource } from "@/lib/data/workspace";
import { outputHref } from "@/lib/tools/shared/output-links";

interface Props {
  params: Promise<{ outputId: string }>;
}

export const metadata: Metadata = { title: "مخرج" };

/** A stored output opens in its tool's own review page; samples render here in preview mode. */
export default async function OutputPage({ params }: Props) {
  const { outputId } = await params;
  const source = await workspaceSource();

  if (source.kind === "live") {
    const stored = await getStoredOutput(source.supabase, outputId);
    if (!stored.ok) {
      if (stored.error.code === "not_found") notFound();
      return <ErrorState title="تعذّر تحميل المخرج" description={stored.error.message} />;
    }
    const href = outputHref(stored.data.tool_type, stored.data.id);
    if (!href) notFound();
    redirect(href);
  }

  const output = getOutput(outputId);
  if (!output) notFound();
  const matter = getMatter(output.matterId);

  return (
    <>
      <Link href="/outputs" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        المخرجات
      </Link>
      <PageHeader
        titleEn="Output review"
        title={output.title}
        description={`${getToolName(output.toolId)}${matter ? ` · ${matter.title}` : ""}`}
      />
      <div className="max-w-4xl">
        <AIResultPanel result={output.result} />
      </div>
    </>
  );
}
