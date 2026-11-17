import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { ContentGenerate } from "@/components/tools/legal-content/content-generate";
import { DatabaseRequiredNotice, ToolSetup } from "@/components/tools/shared/tool-setup";
import { getTool } from "@/config/tools";
import { isAIConfigured } from "@/lib/ai/config";
import { getSessionState } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "المحتوى القانوني" };
export const maxDuration = 300;

interface Props {
  searchParams: Promise<{ matter?: string; new?: string }>;
}

export default async function LegalContentPage({ searchParams }: Props) {
  const tool = getTool("legal-content");
  const [{ matter, new: isNew }, session] = await Promise.all([searchParams, getSessionState()]);
  const aiConfigured = isAIConfigured();
  const firmName = session.kind === "authenticated" ? (session.profile.organization ?? "") : "";

  return (
    <>
      <Link href="/tools" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        الأدوات
      </Link>
      <PageHeader
        titleEn={tool?.nameEn}
        title={tool?.nameAr ?? "المحتوى القانوني"}
        description="يحوّل نصًا قانونيًا أو مقالًا أو تحديثًا تنظيميًا أو ملاحظات المحامي إلى محتوى بقوالب ثابتة: تنبيه قانوني، عرض شرائح، منشور لينكدإن، تحديث للعملاء، أسئلة شائعة، منشور توعوي."
        actions={<StatusBadge status="available" />}
      />
      <ToolSetup
        toolPath="/tools/legal-content"
        toolType="legal_content"
        matterParam={matter}
        newParam={isNew}
        textKinds={["legal_text", "article", "regulation_update", "lawyer_notes"]}
        previewFallback={<DatabaseRequiredNotice />}
        generateTitle="إعداد المحتوى"
        generateDescription="اختر نوع المحتوى والمصادر."
        outputsTitle="محتوى هذا الملف"
        renderGenerate={(ctx) => <ContentGenerate matterId={ctx.matterId} aiConfigured={aiConfigured} defaultFirmName={firmName} documents={ctx.documents} />}
      />
    </>
  );
}
