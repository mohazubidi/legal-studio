import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { IntakeBrief } from "@/components/tools/matter-intake/brief";
import { StartIntakeButton } from "@/components/tools/matter-intake/intake-buttons";
import { DatabaseRequiredNotice } from "@/components/tools/shared/tool-setup";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTool } from "@/config/tools";
import { listMatters } from "@/lib/data/matters";
import { createSupabaseServerClient, getSessionState } from "@/lib/supabase/server";
import { SAMPLE_INTAKE, SAMPLE_INTAKE_REFERENCES } from "@/lib/tools/matter-intake/sample";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "استقبال القضايا" };

export default async function MatterIntakePage() {
  const tool = getTool("matter-intake");
  const session = await getSessionState();
  const header = (
    <>
      <Link href="/tools" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        الأدوات
      </Link>
      <PageHeader
        titleEn={tool?.nameEn}
        title={tool?.nameAr ?? "استقبال القضايا"}
        description="استقبال موجَّه لمعلومات العميل (نموذج، نص حر، مستندات، تسجيلات صوتية) وتحويلها إلى ملخص منظم قابل للتحرير قبل إنشاء الملف. لا يقدّم استشارة قانونية."
        actions={<StatusBadge status="available" />}
      />
    </>
  );

  if (session.kind !== "authenticated") {
    return (
      <>
        {header}
        <DatabaseRequiredNotice />
        <IntakeBrief outputId={null} content={SAMPLE_INTAKE} references={SAMPLE_INTAKE_REFERENCES} isSample />
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const intakes = supabase ? await listMatters(supabase, { intake: "only" }) : null;

  return (
    <>
      {header}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="block">
            <CardTitle>استقبالات قيد الإعداد</CardTitle>
            <CardDescription>ملفات مؤقتة لم يُنشأ منها ملف بعد. لا تظهر في الأدوات الأخرى حتى إنشاء الملف.</CardDescription>
          </CardHeader>
          <CardContent>
            {!intakes || !intakes.ok ? (
              <ErrorState title="تعذّر تحميل الاستقبالات" description={intakes && !intakes.ok ? intakes.error.message : undefined} />
            ) : intakes.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد استقبالات مفتوحة.</p>
            ) : (
              <ul className="divide-y divide-border">
                {intakes.data.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/tools/matter-intake/${m.id}`} className="text-sm font-medium text-primary hover:underline">
                      {m.matter_name}
                    </Link>
                    <span className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader className="block">
            <CardTitle>استقبال جديد</CardTitle>
            <CardDescription>يُنشأ ملف مؤقت لحفظ مواد العميل. تراجع الملخص وتعدّله، ثم تنشئ الملف.</CardDescription>
          </CardHeader>
          <CardContent>
            <StartIntakeButton />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
