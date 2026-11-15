import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Bot } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { ProvenanceItem, ProvenanceLegend } from "@/components/legal/provenance";
import { StatusBadge } from "@/components/legal/status-badge";
import { DraftEditor } from "@/components/tools/legal-memo/draft-editor";
import { ReviewControls } from "@/components/tools/shared/review-controls";
import { SOURCE_KIND_LABELS } from "@/components/tools/shared/sources-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAIConfigured } from "@/lib/ai/config";
import { createSupabaseServerClient, getSessionState } from "@/lib/supabase/server";
import { INSUFFICIENT_EVIDENCE } from "@/lib/tools/legal-memo/content";
import { getMemo } from "@/lib/tools/legal-memo/service";
import { buildMemoView } from "@/lib/tools/legal-memo/view";
import { formatDateTime } from "@/lib/utils";
import type { DocumentProcessingStatus, SourceKind } from "@/types/database";

export const metadata: Metadata = { title: "مراجعة المذكرة" };
export const maxDuration = 300;

interface Props {
  params: Promise<{ outputId: string }>;
}

function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader className="block">
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Insufficient() {
  return <p className="text-sm text-missing">{INSUFFICIENT_EVIDENCE}</p>;
}

export default async function MemoReviewPage({ params }: Props) {
  const session = await getSessionState();
  if (session.kind !== "authenticated") redirect("/tools/legal-memo");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/tools/legal-memo");

  const { outputId } = await params;
  const memo = await getMemo(supabase, outputId);
  if (!memo.ok) {
    if (memo.error.code === "not_found") notFound();
    return <ErrorState title="تعذّر عرض المذكرة" description={memo.error.message} />;
  }

  const { output, content, references } = memo.data;
  const view = buildMemoView(content, references);
  const verifyCount =
    view.factGroups.reduce((n, group) => n + group.items.filter((item) => item.type === "verify").length, 0) +
    (view.summary.type === "verify" ? 1 : 0);

  return (
    <>
      <Link
        href={`/tools/legal-memo?matter=${output.matter_id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowRight className="size-4" aria-hidden />
        العودة إلى الملف
      </Link>
      <PageHeader
        titleEn="Legal Memo · Draft for professional review"
        title={output.title}
        description={`أُنشئت ${formatDateTime(content.generated_at)} · النموذج ${content.model}`}
        actions={<StatusBadge status={output.status} />}
      />

      <div role="note" className="mb-6 flex items-start gap-3 rounded-md border border-analysis/30 bg-analysis-soft px-4 py-3 text-sm leading-6">
        <Bot className="mt-0.5 size-4 shrink-0 text-analysis" aria-hidden />
        <p>
          هذه مادة مولّدة بمساعدة الذكاء الاصطناعي لتنظيم المصادر، وليست رأيًا قانونيًا. الوقائع المستندة إلى المصادر تحمل إحالات تحقق الخادم من وجود نصها في
          المصدر؛ ما عدا ذلك موسوم بوضوح. لا تُعتمد المذكرة إلا بإجراء صريح منك.
        </p>
      </div>

      {content.warnings.length > 0 || view.danglingReferenceIds.length > 0 ? (
        <div role="status" className="mb-6 rounded-md border border-verify/30 bg-verify-soft px-4 py-3 text-sm text-verify">
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4" aria-hidden />
            تنبيهات التحقق
          </p>
          <ul className="list-disc space-y-0.5 ps-5">
            {content.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
            {view.danglingReferenceIds.length > 0 ? <li>بعض الإحالات لم تعد موجودة (ربما حُذف المستند).</li> : null}
          </ul>
        </div>
      ) : null}

      <div className="mb-6">
        <ProvenanceLegend compact />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section id="sources" title="المصادر المعالجة" description="المرحلة 1: هوية كل مصدر وحالة معالجته عند إنشاء المذكرة.">
            <ul className="divide-y divide-border text-sm">
              {content.sources.map((source) => (
                <li key={source.document_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="tabular w-8 text-xs font-semibold text-muted-foreground">{source.label}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{source.file_name}</span>
                  <span className="text-xs text-muted-foreground">{SOURCE_KIND_LABELS[source.source_kind as SourceKind] ?? source.source_kind}</span>
                  <StatusBadge status={source.processing_status as DocumentProcessingStatus} />
                  {source.processing_error ? <p className="w-full text-xs text-danger">{source.processing_error}</p> : null}
                </li>
              ))}
            </ul>
          </Section>

          <Section id="summary" title="ملخص الملف">
            <ul>
              <ProvenanceItem item={view.summary} />
            </ul>
          </Section>

          <Section id="facts" title="الوقائع المستخرجة" description="المرحلة 2: من المصادر فقط. اضغط رقم الإحالة لعرض المستند والموضع والنص الداعم.">
            {view.factGroups.length === 0 ? (
              <Insufficient />
            ) : (
              <div className="space-y-5">
                {view.factGroups.map((group) => (
                  <div key={group.category}>
                    <h3 className="mb-2 text-sm font-semibold">{group.label}</h3>
                    <ul className="space-y-2">
                      {group.items.map((item) => (
                        <ProvenanceItem key={item.id} item={item} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section id="missing" title="المعلومات الناقصة أو غير الواضحة أو المتعارضة" description="المرحلة 3.">
            {view.missing.length === 0 ? (
              <p className="text-sm text-muted-foreground">لم يُحدَّد نقص صريح. تحقق من ذلك أثناء المراجعة.</p>
            ) : (
              <ul className="space-y-2">
                {view.missing.map((item) => (
                  <ProvenanceItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </Section>

          <Section
            id="issues"
            title="مسائل قانونية محتملة"
            description="المرحلة 4: اقتراحات مولّدة بالذكاء الاصطناعي للمراجعة المهنية، وليست استنتاجات قانونية متحقَّقًا منها."
          >
            {view.issues.length === 0 ? (
              <Insufficient />
            ) : (
              <ul className="space-y-2">
                {view.issues.map((item) => (
                  <ProvenanceItem key={item.id} item={item} />
                ))}
              </ul>
            )}
          </Section>

          <Section id="structure" title="هيكل المذكرة" description="المرحلة 5.">
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-sm font-semibold">المستندات ذات الصلة</h3>
                {content.relevant_documents.length === 0 ? (
                  <Insufficient />
                ) : (
                  <ul className="list-disc space-y-1 ps-5 text-sm leading-7">
                    {content.relevant_documents.map((doc) => (
                      <li key={doc.document_id}>
                        <a href={`/api/documents/${doc.document_id}/download`} className="font-medium text-primary hover:underline">
                          {content.sources.find((s) => s.document_id === doc.document_id)?.file_name ?? "مستند"}
                        </a>{" "}
                        — {doc.relevance}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">أسئلة تتطلب بحثًا قانونيًا</h3>
                {view.researchQuestions.length === 0 ? (
                  <Insufficient />
                ) : (
                  <ul className="space-y-2">
                    {view.researchQuestions.map((item) => (
                      <ProvenanceItem key={item.id} item={item} />
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">هيكل التحليل الأولي (اقتراح)</h3>
                {content.analysis_structure.length === 0 ? (
                  <Insufficient />
                ) : (
                  <ol className="list-decimal space-y-3 ps-5 text-sm leading-7">
                    {content.analysis_structure.map((section) => (
                      <li key={section.heading}>
                        <span className="font-medium">{section.heading}</span>
                        {section.points.length > 0 ? (
                          <ul className="mt-1 list-disc ps-5 text-muted-foreground">
                            {section.points.map((point) => (
                              <li key={point}>{point}</li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </Section>

          <Section id="draft" title="المسودة الأولى" description="المرحلة 6: نص قابل للتعديل. أرقام [م n] تشير إلى قائمة الإحالات.">
            <DraftEditor outputId={output.id} status={output.status} aiConfigured={isAIConfigured()} draft={content.draft} />
          </Section>
        </div>

        <div className="space-y-6">
          <Card className="xl:sticky xl:top-24">
            <CardHeader className="block">
              <CardTitle>المراجعة البشرية</CardTitle>
              <CardDescription>مسودة ← بانتظار المراجعة ← تمت المراجعة ← معتمدة</CardDescription>
            </CardHeader>
            <CardContent>
              <ReviewControls
                outputId={output.id}
                status={output.status}
                hasDraft={content.draft !== null}
                notes={output.review_notes}
                reviewedAt={output.reviewed_at}
                approvedAt={output.approved_at}
                openItems={{ verify: verifyCount, missing: view.missing.length }}
              />
            </CardContent>
          </Card>

          <Section id="references" title="قائمة الإحالات" description="كل إحالة: المستند، الصفحة أو القسم، والنص الداعم كما ورد.">
            {view.citations.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد إحالات متحقَّق منها.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {view.citations.map((citation) => (
                  <li key={citation.number} id={`ref-${citation.number}`} className="rounded-md border border-source/20 bg-source-soft/50 p-3">
                    <p className="mb-1 text-xs font-semibold text-source">
                      [م{citation.number}] {citation.documentName}
                      {citation.location ? ` · ${citation.location}` : ""}
                    </p>
                    <blockquote className="border-s-2 border-source ps-2 font-serif leading-7">«{citation.excerpt}»</blockquote>
                    <a href={citation.href} className="mt-1 inline-block text-xs text-primary hover:underline">
                      فتح المستند الأصلي
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
