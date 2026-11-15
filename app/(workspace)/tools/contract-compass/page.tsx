import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { ContractGenerate } from "@/components/tools/contract-compass/contract-generate";
import { ContractCompassView } from "@/components/tools/contract-compass/contract-view";
import { DatabaseRequiredNotice, ToolSetup } from "@/components/tools/shared/tool-setup";
import { getTool } from "@/config/tools";
import { isAIConfigured } from "@/lib/ai/config";
import { SAMPLE_CONTRACT, SAMPLE_CONTRACT_REFERENCES } from "@/lib/tools/contract-compass/sample";

export const metadata: Metadata = { title: "بوصلة العقود" };
export const maxDuration = 300;

interface Props {
  searchParams: Promise<{ matter?: string; new?: string }>;
}

export default async function ContractCompassPage({ searchParams }: Props) {
  const tool = getTool("contract-compass");
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
        title={tool?.nameAr ?? "بوصلة العقود"}
        description="يحوّل العقد إلى عرض تشغيلي منظم: الأطراف، المدد، الالتزامات، المواعيد، الشروط المالية، والبنود التي تستحق المراجعة. لا يقدّم حكمًا قانونيًا."
        actions={<StatusBadge status="available" />}
      />
      <ToolSetup
        toolPath="/tools/contract-compass"
        toolType="contract_compass"
        matterParam={matter}
        newParam={isNew}
        previewFallback={
          <>
            <DatabaseRequiredNotice />
            <ContractCompassView outputId={null} content={SAMPLE_CONTRACT} references={SAMPLE_CONTRACT_REFERENCES} isSample />
          </>
        }
        generateTitle="تحليل العقد"
        generateDescription="اختر العقد من مصادر الملف."
        outputsTitle="تحليلات العقود في هذا الملف"
        renderGenerate={(ctx) => <ContractGenerate matterId={ctx.matterId} aiConfigured={aiConfigured} documents={ctx.documents} />}
      />
    </>
  );
}
