import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Construction } from "lucide-react";
import { AIResultPanel } from "@/components/legal/ai-result-panel";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { getTool } from "@/config/tools";
import { getSampleResult } from "@/data/mock";

interface Props {
  params: Promise<{ toolId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { toolId } = await params;
  return { title: getTool(toolId)?.nameAr ?? "أداة" };
}

export default async function ToolWorkspacePage({ params }: Props) {
  const { toolId } = await params;
  const tool = getTool(toolId);
  if (!tool) notFound();

  return (
    <>
      <Link href="/tools" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        الأدوات
      </Link>
      <PageHeader titleEn={tool.nameEn} title={tool.nameAr} description={tool.descriptionAr} actions={<StatusBadge status={tool.status} />} />

      <div role="status" className="mb-6 flex items-start gap-3 rounded-md border border-accent/40 bg-accent-soft px-4 py-3 text-sm">
        <Construction className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <p>
          <span className="font-semibold">هذه الأداة قيد التطوير.</span> المخرج المعروض أدناه محتوى توضيحي لبيان طريقة عرض النتائج،
          وليس ناتجًا عن تحليل فعلي.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <Card className="h-fit">
          <CardHeader className="block">
            <CardTitle>المدخلات</CardTitle>
            <CardDescription>اختر الملف والمستندات، ثم صِف المطلوب.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tool-instructions">التعليمات</Label>
              <Textarea id="tool-instructions" disabled placeholder="مثال: أعدّ مذكرة أولية حول التأخر في التسليم…" />
            </div>
          </CardContent>
          <CardFooter>
            <Button disabled>تشغيل الأداة</Button>
            <span className="text-xs text-muted-foreground">غير متاح في هذه المرحلة</span>
          </CardFooter>
        </Card>

        <AIResultPanel result={getSampleResult(tool.id)} />
      </div>
    </>
  );
}
