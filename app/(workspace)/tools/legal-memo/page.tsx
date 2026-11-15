import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { AIResultPanel } from "@/components/legal/ai-result-panel";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { UploadArea } from "@/components/legal/upload-area";
import { GenerateMemo } from "@/components/tools/legal-memo/generate-memo";
import { NewMatterForm } from "@/components/tools/legal-memo/new-matter-form";
import { SourcesPanel } from "@/components/tools/legal-memo/sources-panel";
import { TextSourceForm } from "@/components/tools/legal-memo/text-source-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTool } from "@/config/tools";
import { getSampleResult } from "@/data/mock";
import { getTranscriptionConfig, isAIConfigured } from "@/lib/ai/config";
import { listDocuments } from "@/lib/data/documents";
import { listMatters } from "@/lib/data/matters";
import { createSupabaseServerClient, getSessionState } from "@/lib/supabase/server";
import { listMemos } from "@/lib/tools/legal-memo/service";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "منشئ المذكرة القانونية" };
/** Generation runs inside server actions on this route. */
export const maxDuration = 300;

interface Props {
  searchParams: Promise<{ matter?: string; new?: string }>;
}

function Stage({ n, title, description, children }: { n: number; title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="block">
        <p className="tabular text-xs font-semibold text-accent">المرحلة {n}</p>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

export default async function LegalMemoPage({ searchParams }: Props) {
  const tool = getTool("legal-memo");
  const session = await getSessionState();
  const header = (
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
    </>
  );

  // Preview mode or missing Supabase: say so; never pretend to process data.
  if (session.kind !== "authenticated") {
    return (
      <>
        {header}
        <div role="status" className="mb-6 flex items-start gap-3 rounded-md border border-missing/30 bg-missing-soft px-4 py-3 text-sm leading-6">
          <Database className="mt-0.5 size-4 shrink-0 text-missing" aria-hidden />
          <p>
            <span className="font-semibold">الأداة تتطلب قاعدة البيانات.</span> هذا الخادم يعمل دون ربط Supabase، لذلك لا يمكن رفع المصادر أو حفظ المذكرات.
            المعروض أدناه مثال توضيحي لشكل النتائج فقط.
          </p>
        </div>
        <AIResultPanel result={getSampleResult("legal-memo")} />
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { matter: matterParam, new: newParam } = await searchParams;

  const matters = await listMatters(supabase);
  if (!matters.ok) {
    return (
      <>
        {header}
        <ErrorState title="تعذّر تحميل الملفات" description={matters.error.message} />
      </>
    );
  }

  const selected = matters.data.find((m) => m.id === matterParam) ?? (newParam ? undefined : matters.data[0]);

  if (!selected) {
    return (
      <>
        {header}
        <Card className="max-w-3xl">
          <CardHeader className="block">
            <CardTitle>ملف جديد</CardTitle>
            <CardDescription>تُربط المصادر والمذكرات بملف. أنشئ ملفًا للبدء.</CardDescription>
          </CardHeader>
          <CardContent>
            <NewMatterForm />
          </CardContent>
        </Card>
      </>
    );
  }

  const [documents, memos] = await Promise.all([listDocuments(supabase, selected.id), listMemos(supabase, selected.id)]);
  const docs = documents.ok ? documents.data : [];
  const processedCount = docs.filter((doc) => doc.processing_status === "processed").length;
  const inFlight = docs.some((doc) => doc.processing_status === "pending" || doc.processing_status === "processing");
  const blockedReason = inFlight
    ? "بعض المصادر قيد المعالجة. انتظر اكتمالها."
    : processedCount === 0
      ? "لا توجد مصادر معالجة بعد."
      : null;

  return (
    <>
      {header}

      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="matter" className="text-sm font-medium">
            الملف
          </label>
          <select
            id="matter"
            name="matter"
            defaultValue={selected.id}
            className="block h-9 min-w-64 rounded-md border border-border-strong bg-surface px-3 text-sm"
          >
            {matters.data.map((matter) => (
              <option key={matter.id} value={matter.id}>
                {matter.matter_name}
                {matter.client_name ? ` — ${matter.client_name}` : ""}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          عرض
        </Button>
        <Button asChild variant="ghost">
          <Link href="/tools/legal-memo?new=1">ملف جديد</Link>
        </Button>
      </form>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Stage n={1} title="المصادر ومعالجتها" description="ارفع المستندات والتسجيلات، أو الصق نصًا أو ملاحظات أو محضر اجتماع. تُستخرج النصوص مع الصفحة أو القسم، وتُحفظ أخطاء المعالجة لكل مصدر.">
            {documents.ok ? (
              <SourcesPanel
                matterId={selected.id}
                documents={docs}
                transcriptionConfigured={getTranscriptionConfig() !== null}
              />
            ) : (
              <ErrorState title="تعذّر تحميل المصادر" description={documents.error.message} />
            )}
            <div>
              <h3 className="mb-2 text-sm font-semibold">رفع ملفات</h3>
              <UploadArea matterId={selected.id} />
              <p className="mt-2 text-xs text-muted-foreground">بعد الرفع اضغط «معالجة المصادر». النصوص الملصقة وملفات TXT تُعالج مباشرة.</p>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">إضافة نص</h3>
              <TextSourceForm matterId={selected.id} />
            </div>
          </Stage>
        </div>

        <div className="space-y-6">
          <Stage n={2} title="تحليل المذكرة" description="المراحل 2–5: الوقائع، المعلومات الناقصة، المسائل المحتملة، هيكل المذكرة.">
            <GenerateMemo matterId={selected.id} aiConfigured={isAIConfigured()} processedCount={processedCount} blockedReason={blockedReason} />
          </Stage>

          <Card>
            <CardHeader className="block">
              <CardTitle>مذكرات هذا الملف</CardTitle>
            </CardHeader>
            <CardContent>
              {!memos.ok ? (
                <p className="text-sm text-danger">{memos.error.message}</p>
              ) : memos.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد مذكرات بعد.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {memos.data.map((memo) => (
                    <li key={memo.id} className="flex items-center justify-between gap-3 py-2.5">
                      <Link href={`/tools/legal-memo/${memo.id}`} className="min-w-0 text-sm font-medium text-primary hover:underline">
                        <span className="block truncate">{memo.title}</span>
                        <span className="text-xs font-normal text-muted-foreground">{formatDateTime(memo.created_at)}</span>
                      </Link>
                      <StatusBadge status={memo.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
