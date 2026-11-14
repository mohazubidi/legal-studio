import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AIResultPanel } from "@/components/legal/ai-result-panel";
import { PageHeader } from "@/components/legal/page-header";
import { getToolName } from "@/config/tools";
import { getMatter, getOutput } from "@/data/mock";

interface Props {
  params: Promise<{ outputId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { outputId } = await params;
  return { title: getOutput(outputId)?.title ?? "مخرج" };
}

export default async function OutputPage({ params }: Props) {
  const { outputId } = await params;
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
