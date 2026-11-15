import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AIResultPanel } from "@/components/legal/ai-result-panel";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { GenerateOutput } from "@/components/tools/shared/generate-output";
import { DatabaseRequiredNotice, ToolSetup } from "@/components/tools/shared/tool-setup";
import { getTool } from "@/config/tools";
import { getSampleResult } from "@/data/mock";
import { isAIConfigured } from "@/lib/ai/config";
import { generateMemoAction } from "./actions";

export const metadata: Metadata = { title: "منشئ المذكرة القانونية" };
/** Generation runs inside server actions on this route. */
export const maxDuration = 300;

interface Props {
  searchParams: Promise<{ matter?: string; new?: string }>;
}

export default async function LegalMemoPage({ searchParams }: Props) {
  const tool = getTool("legal-memo");
  const { matter, new: isNew } = await searchParams;
  const aiConfigured = isAIConfigured();

  return (
    <>
      <Link href="/tools" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        الأدوات
      </Link>
      <PageHeader
        titleEn={tool?.nameEn}
        title={tool?.nameAr ?? "المذكرة القانونية"}
        description="يحوّل مصادر الملف إلى مسودة مذكرة منظمة للمراجعة المهنية. لا يقدّم رأيًا قانونيًا نهائيًا."
        actions={<StatusBadge status="available" />}
      />
      <ToolSetup
        toolPath="/tools/legal-memo"
        toolType="legal_memo"
        matterParam={matter}
        newParam={isNew}
        previewFallback={
          <>
            <DatabaseRequiredNotice />
            <AIResultPanel result={getSampleResult("legal-memo")} />
          </>
        }
        generateTitle="تحليل المذكرة"
        generateDescription="المراحل 2–5: الوقائع، المعلومات الناقصة، المسائل المحتملة، هيكل المذكرة."
        outputsTitle="مذكرات هذا الملف"
        renderGenerate={(ctx) => (
          <GenerateOutput
            {...ctx}
            aiConfigured={aiConfigured}
            action={generateMemoAction}
            outputPath="/tools/legal-memo"
            description="يستخرج الوقائع مع إحالاتها، ويحدد المعلومات الناقصة، ويقترح المسائل القانونية للمراجعة، ويبني هيكل المذكرة. يُحفظ الناتج كمسودة ولا يُعتمد إلا بإجراء صريح منك."
            label="توليد تحليل المذكرة"
          />
        )}
      />
    </>
  );
}
