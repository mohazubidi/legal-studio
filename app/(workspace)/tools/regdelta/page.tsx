import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { RegDeltaGenerate } from "@/components/tools/regdelta/regdelta-generate";
import { RegDeltaView } from "@/components/tools/regdelta/regdelta-view";
import { DatabaseRequiredNotice, ToolSetup } from "@/components/tools/shared/tool-setup";
import { getTool } from "@/config/tools";
import { isAIConfigured } from "@/lib/ai/config";
import { SAMPLE_REGDELTA, SAMPLE_REGDELTA_REFERENCES } from "@/lib/tools/regdelta/sample";

export const metadata: Metadata = { title: "مقارنة التعديلات التنظيمية" };
export const maxDuration = 300;

interface Props {
  searchParams: Promise<{ matter?: string; new?: string }>;
}

export default async function RegDeltaPage({ searchParams }: Props) {
  const tool = getTool("regdelta");
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
        title={tool?.nameAr ?? "مقارنة التعديلات"}
        description="يقارن نسختين من نص تنظيمي مقارنة هيكلية: المواد المضافة والمحذوفة والمعدّلة والمعاد ترقيمها، والمهل والمبالغ والتعريفات والمسؤوليات والإجراءات. لا يبحث في مصادر خارجية ولا يفترض نفاذ أي نسخة."
        actions={<StatusBadge status="available" />}
      />
      <ToolSetup
        toolPath="/tools/regdelta"
        toolType="regdelta"
        matterParam={matter}
        newParam={isNew}
        previewFallback={
          <>
            <DatabaseRequiredNotice />
            <RegDeltaView outputId={null} content={SAMPLE_REGDELTA} references={SAMPLE_REGDELTA_REFERENCES} isSample />
          </>
        }
        generateTitle="مقارنة النسختين"
        generateDescription="اختر المستند (أ) النسخة السابقة والمستند (ب) النسخة الجديدة."
        outputsTitle="المقارنات في هذا الملف"
        renderGenerate={(ctx) => <RegDeltaGenerate matterId={ctx.matterId} aiConfigured={aiConfigured} documents={ctx.documents} />}
      />
    </>
  );
}
