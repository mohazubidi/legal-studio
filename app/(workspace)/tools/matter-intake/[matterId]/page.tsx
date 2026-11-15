import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Mic } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { UploadArea } from "@/components/legal/upload-area";
import { IntakeForm } from "@/components/tools/matter-intake/intake-form";
import { DiscardIntakeButton } from "@/components/tools/matter-intake/intake-buttons";
import { GenerateOutput } from "@/components/tools/shared/generate-output";
import { SourcesPanel } from "@/components/tools/shared/sources-panel";
import { TextSourceForm } from "@/components/tools/shared/text-source-form";
import { ToolStage } from "@/components/tools/shared/tool-setup";
import { getTranscriptionConfig, isAIConfigured } from "@/lib/ai/config";
import { listDocuments } from "@/lib/data/documents";
import { getMatter } from "@/lib/data/matters";
import { createSupabaseServerClient, getSessionState } from "@/lib/supabase/server";
import { listToolOutputs } from "@/lib/tools/shared/output";
import { formatDateTime } from "@/lib/utils";
import { generateIntakeBriefAction } from "../actions";

export const metadata: Metadata = { title: "استقبال قضية" };
export const maxDuration = 300;

export default async function IntakeWorkspacePage({ params }: { params: Promise<{ matterId: string }> }) {
  const session = await getSessionState();
  if (session.kind !== "authenticated") redirect("/tools/matter-intake");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/tools/matter-intake");

  const { matterId } = await params;
  const matter = await getMatter(supabase, matterId);
  if (!matter.ok) {
    if (matter.error.code === "not_found") notFound();
    return <ErrorState title="تعذّر تحميل الاستقبال" description={matter.error.message} />;
  }
  const [documents, briefs] = await Promise.all([listDocuments(supabase, matterId), listToolOutputs(supabase, matterId, "matter_intake")]);
  const docs = documents.ok ? documents.data : [];
  const transcription = getTranscriptionConfig() !== null;
  const formSubmitted = docs.some((d) => d.source_kind === "intake_form");
  const processedCount = docs.filter((d) => d.processing_status === "processed").length;
  const inFlight = docs.some((d) => d.processing_status === "pending" || d.processing_status === "processing");
  const finalized = matter.data.status !== "intake";

  return (
    <>
      <Link href="/tools/matter-intake" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        الاستقبالات
      </Link>
      <PageHeader
        titleEn="Matter Intake"
        title={matter.data.matter_name}
        description="أدخل معلومات العميل بالترتيب، ثم أنشئ ملخص الاستقبال وراجعه قبل إنشاء الملف."
        actions={<StatusBadge status={matter.data.status} />}
      />
      {finalized ? (
        <p role="status" className="mb-6 rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">
          اكتمل هذا الاستقبال وأُنشئ منه ملف نشط. يمكنك متابعته من الأدوات الأخرى.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <ToolStage n={1} title="نموذج الاستقبال" description="أسئلة موجَّهة. تُحفظ الإجابات كما كتبها العميل.">
            <IntakeForm matterId={matterId} submitted={formSubmitted} />
          </ToolStage>

          <ToolStage n={2} title="رواية العميل والمستندات والتسجيلات" description="نص حر بكلمات العميل، ومستندات، وتسجيلات صوتية تُفرَّغ قبل استخدامها.">
            {!transcription ? (
              <p role="status" className="flex items-start gap-2 rounded-md border border-missing/30 bg-missing-soft px-3 py-2 text-sm leading-6 text-missing">
                <Mic className="mt-1 size-4 shrink-0" aria-hidden />
                <span>
                  <span className="font-semibold">التفريغ الصوتي غير متاح على هذا الخادم.</span> يمكن رفع التسجيلات وحفظها، لكنها لن تُفرَّغ ولن تُستخدم في الملخص حتى تُضبط خدمة التفريغ (
                  <code dir="ltr">TRANSCRIPTION_API_URL</code>، <code dir="ltr">TRANSCRIPTION_API_KEY</code>، <code dir="ltr">TRANSCRIPTION_MODEL</code>).
                </span>
              </p>
            ) : null}
            <div>
              <h3 className="mb-2 text-sm font-semibold">رواية العميل بكلماته</h3>
              <TextSourceForm matterId={matterId} kinds={["client_statement", "pasted_text"]} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">مستندات وتسجيلات صوتية</h3>
              <UploadArea matterId={matterId} />
            </div>
            {documents.ok ? (
              <SourcesPanel matterId={matterId} documents={docs} transcriptionConfigured={transcription} />
            ) : (
              <ErrorState title="تعذّر تحميل المواد" description={documents.error.message} />
            )}
          </ToolStage>
        </div>

        <div className="space-y-6">
          <ToolStage n={3} title="ملخص الاستقبال" description="يُنظّم المعلومات ويحدد الناقص والتعارضات والأسئلة واستبيان المتابعة.">
            {finalized ? (
              <p className="text-sm text-muted-foreground">اكتمل الاستقبال.</p>
            ) : (
              <GenerateOutput
                matterId={matterId}
                aiConfigured={isAIConfigured()}
                processedCount={processedCount}
                blockedReason={inFlight ? "بعض المواد قيد المعالجة. انتظر اكتمالها." : processedCount === 0 ? "احفظ إجابات النموذج أو رواية العميل أولًا." : null}
                action={generateIntakeBriefAction}
                outputPath="/tools/matter-intake/brief"
                description="لا يقدّم الملخص استشارة قانونية. ما لم يقدّمه العميل يُوسم «لم يُقدَّم» ولا يُملأ."
                label="إنشاء ملخص الاستقبال"
              />
            )}
          </ToolStage>
          <ToolStage n={4} title="المراجعة وإنشاء الملف" description="افتح الملخص، عدّله، ثم أنشئ الملف منه.">
            {!briefs.ok ? (
              <p className="text-sm text-danger">{briefs.error.message}</p>
            ) : briefs.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد ملخصات بعد.</p>
            ) : (
              <ul className="divide-y divide-border">
                {briefs.data.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                    <Link href={`/tools/matter-intake/brief/${b.id}`} className="text-sm font-medium text-primary hover:underline">
                      {b.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">{formatDateTime(b.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            {!finalized ? <DiscardIntakeButton matterId={matterId} /> : null}
          </ToolStage>
        </div>
      </div>
    </>
  );
}
