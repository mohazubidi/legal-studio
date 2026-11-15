import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { StatusBadge } from "@/components/legal/status-badge";
import { ToolStage } from "@/components/tools/shared/tool-setup";
import { MatterSources } from "@/components/tools/shared/matter-sources";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getToolName, TOOLS } from "@/config/tools";
import { listDocuments } from "@/lib/data/documents";
import { getMatter } from "@/lib/data/matters";
import { listOutputs } from "@/lib/data/outputs";
import { workspaceSource } from "@/lib/data/workspace";
import { outputHref, TOOL_ID_BY_TYPE } from "@/lib/tools/shared/output-links";
import { formatDateTime } from "@/lib/utils";

interface Props {
  params: Promise<{ matterId: string }>;
}

/** Tools that run on an existing matter. Intake creates matters; it does not run on one. */
const MATTER_TOOLS = TOOLS.filter((tool) => tool.status === "available" && tool.id !== "matter-intake");

export const metadata: Metadata = { title: "ملف" };

export default async function MatterPage({ params }: Props) {
  const { matterId } = await params;
  const source = await workspaceSource();
  if (source.kind === "preview") redirect("/matters");

  const matter = await getMatter(source.supabase, matterId);
  if (!matter.ok) {
    if (matter.error.code === "not_found") notFound();
    return <ErrorState title="تعذّر تحميل الملف" description={matter.error.message} />;
  }
  // An intake is finished in its own tool before it becomes a matter.
  if (matter.data.status === "intake") redirect(`/tools/matter-intake/${matter.data.id}`);

  const [documents, outputs] = await Promise.all([listDocuments(source.supabase, matterId), listOutputs(source.supabase, matterId)]);
  const subtitle = [matter.data.client_name, matter.data.matter_type].filter(Boolean).join(" · ");

  return (
    <>
      <Link href="/matters" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        القضايا والملفات
      </Link>
      <PageHeader
        titleEn="Matter"
        title={matter.data.matter_name}
        description={subtitle || undefined}
        actions={<StatusBadge status={matter.data.status} />}
      />
      {matter.data.description ? (
        <p className="mb-6 max-w-3xl whitespace-pre-line text-sm leading-7 text-muted-foreground">{matter.data.description}</p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <ToolStage
          n={1}
          title="مصادر الملف"
          description="المستندات والتسجيلات والنصوص التي تستند إليها الأدوات. تُحفظ أخطاء المعالجة لكل مصدر ويمكن إعادة المحاولة."
        >
          <MatterSources matterId={matterId} documents={documents} />
        </ToolStage>

        <div className="space-y-6">
          <Card>
            <CardHeader className="block">
              <CardTitle>تشغيل أداة على هذا الملف</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {MATTER_TOOLS.map((tool) => (
                  <li key={tool.id}>
                    <Link href={`/tools/${tool.id}?matter=${matterId}`} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                      <tool.icon className="size-4" aria-hidden />
                      {tool.nameAr}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="block">
              <CardTitle>مخرجات الملف</CardTitle>
            </CardHeader>
            <CardContent>
              {!outputs.ok ? (
                <p className="text-sm text-danger">{outputs.error.message}</p>
              ) : outputs.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد مخرجات بعد.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {outputs.data.map((output) => {
                    const href = outputHref(output.tool_type, output.id);
                    const label = (
                      <>
                        <span className="block truncate">{output.title}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {getToolName(TOOL_ID_BY_TYPE[output.tool_type])} · {formatDateTime(output.created_at)}
                        </span>
                      </>
                    );
                    return (
                      <li key={output.id} className="flex items-center justify-between gap-3 py-2.5">
                        {href ? (
                          <Link href={href} className="min-w-0 text-sm font-medium text-primary hover:underline">
                            {label}
                          </Link>
                        ) : (
                          <span className="min-w-0 text-sm font-medium">{label}</span>
                        )}
                        <StatusBadge status={output.status} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
