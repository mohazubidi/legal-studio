import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { CaseMapExplorer } from "@/components/tools/casemap/casemap-explorer";
import { GenerateOutput } from "@/components/tools/shared/generate-output";
import { DatabaseRequiredNotice, ToolSetup } from "@/components/tools/shared/tool-setup";
import { getTool } from "@/config/tools";
import { isAIConfigured } from "@/lib/ai/config";
import { SAMPLE_CASEMAP, SAMPLE_CASEMAP_REFERENCES } from "@/lib/tools/casemap/sample";
import { generateCaseMapAction } from "./actions";

export const metadata: Metadata = { title: "خريطة القضية" };
export const maxDuration = 300;

interface Props {
  searchParams: Promise<{ matter?: string; new?: string }>;
}

export default async function CaseMapPage({ searchParams }: Props) {
  const tool = getTool("casemap");
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
        title={tool?.nameAr ?? "خريطة القضية"}
        description="يحوّل مستندات الملف إلى خريطة تفاعلية: الأطراف، التسلسل الزمني، المطالبات والمواقف، الأدلة، التعارضات، والمعلومات الناقصة. لا يحدد أي طرف محق."
        actions={<StatusBadge status="available" />}
      />
      <ToolSetup
        toolPath="/tools/casemap"
        toolType="casemap"
        matterParam={matter}
        newParam={isNew}
        previewFallback={
          <>
            <DatabaseRequiredNotice />
            <CaseMapExplorer outputId={null} content={SAMPLE_CASEMAP} references={SAMPLE_CASEMAP_REFERENCES} isSample />
          </>
        }
        generateTitle="بناء الخريطة"
        generateDescription="استخراج الأطراف والوقائع والمطالبات والأدلة والتعارضات من المصادر المعالجة."
        outputsTitle="خرائط هذا الملف"
        renderGenerate={(ctx) => (
          <GenerateOutput
            {...ctx}
            aiConfigured={aiConfigured}
            action={generateCaseMapAction}
            outputPath="/tools/casemap"
            description="كل عنصر يحمل إحالته إلى المستند والموضع والنص الداعم بعد تحقق الخادم منه. ما لا يمكن ربطه بمصدر يُوسم بأنه غير موثّق ويتطلب مراجعة."
            label="بناء خريطة القضية"
          />
        )}
      />
    </>
  );
}
