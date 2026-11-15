import type { ReactNode } from "react";
import Link from "next/link";
import { Database } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { StatusBadge } from "@/components/legal/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listDocuments } from "@/lib/data/documents";
import { listMatters } from "@/lib/data/matters";
import { createSupabaseServerClient, getSessionState } from "@/lib/supabase/server";
import { listToolOutputs } from "@/lib/tools/shared/output";
import { formatDateTime } from "@/lib/utils";
import type { ToolType } from "@/types/database";
import { MatterSources } from "./matter-sources";
import { NewMatterForm } from "./new-matter-form";

export interface GenerateContext {
  matterId: string;
  processedCount: number;
  blockedReason: string | null;
  /** The matter's sources, for tools that work on one chosen document. */
  documents: { id: string; file_name: string; processing_status: string; source_kind: string }[];
}

interface ToolSetupProps {
  toolPath: string;
  toolType: ToolType;
  matterParam?: string;
  newParam?: string;
  /** Shown when there is no database (preview mode): explains, never fakes data. */
  previewFallback: ReactNode;
  generateTitle: string;
  generateDescription: string;
  renderGenerate: (context: GenerateContext) => ReactNode;
  outputsTitle: string;
}

export function ToolStage({ n, title, description, children }: { n: number; title: string; description: string; children: ReactNode }) {
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

export function DatabaseRequiredNotice() {
  return (
    <div role="status" className="mb-6 flex items-start gap-3 rounded-md border border-missing/30 bg-missing-soft px-4 py-3 text-sm leading-6">
      <Database className="mt-0.5 size-4 shrink-0 text-missing" aria-hidden />
      <p>
        <span className="font-semibold">الأداة تتطلب قاعدة البيانات.</span> هذا الخادم يعمل دون ربط Supabase، لذلك لا يمكن رفع المصادر أو حفظ المخرجات.
        المعروض أدناه مثال توضيحي لشكل النتائج فقط.
      </p>
    </div>
  );
}

/**
 * Shared tool workspace: pick or create a matter, prepare its sources
 * (Stage 1), generate, and list previous outputs of this tool.
 */
export async function ToolSetup(props: ToolSetupProps) {
  const session = await getSessionState();
  if (session.kind !== "authenticated") return <>{props.previewFallback}</>;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return <>{props.previewFallback}</>;

  const matters = await listMatters(supabase);
  if (!matters.ok) return <ErrorState title="تعذّر تحميل الملفات" description={matters.error.message} />;

  const selected = matters.data.find((m) => m.id === props.matterParam) ?? (props.newParam ? undefined : matters.data[0]);
  if (!selected) {
    return (
      <Card className="max-w-3xl">
        <CardHeader className="block">
          <CardTitle>ملف جديد</CardTitle>
          <CardDescription>تُربط المصادر والمخرجات بملف. أنشئ ملفًا للبدء.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewMatterForm basePath={props.toolPath} />
        </CardContent>
      </Card>
    );
  }

  const [documents, outputs] = await Promise.all([listDocuments(supabase, selected.id), listToolOutputs(supabase, selected.id, props.toolType)]);
  const docs = documents.ok ? documents.data : [];
  const processedCount = docs.filter((doc) => doc.processing_status === "processed").length;
  const inFlight = docs.some((doc) => doc.processing_status === "pending" || doc.processing_status === "processing");
  const blockedReason = inFlight ? "بعض المصادر قيد المعالجة. انتظر اكتمالها." : processedCount === 0 ? "لا توجد مصادر معالجة بعد." : null;

  return (
    <>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="matter" className="text-sm font-medium">
            الملف
          </label>
          <select id="matter" name="matter" defaultValue={selected.id} className="block h-9 min-w-64 rounded-md border border-border-strong bg-surface px-3 text-sm">
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
          <Link href={`${props.toolPath}?new=1`}>ملف جديد</Link>
        </Button>
      </form>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <ToolStage
          n={1}
          title="المصادر ومعالجتها"
          description="ارفع المستندات والتسجيلات، أو الصق نصًا أو ملاحظات أو محضر اجتماع. تُستخرج النصوص مع الصفحة أو القسم، وتُحفظ أخطاء المعالجة لكل مصدر."
        >
          <MatterSources matterId={selected.id} documents={documents} />
        </ToolStage>

        <div className="space-y-6">
          <ToolStage n={2} title={props.generateTitle} description={props.generateDescription}>
            {props.renderGenerate({
              matterId: selected.id,
              processedCount,
              blockedReason,
              documents: docs.map((doc) => ({ id: doc.id, file_name: doc.file_name, processing_status: doc.processing_status, source_kind: doc.source_kind })),
            })}
          </ToolStage>

          <Card>
            <CardHeader className="block">
              <CardTitle>{props.outputsTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              {!outputs.ok ? (
                <p className="text-sm text-danger">{outputs.error.message}</p>
              ) : outputs.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد مخرجات بعد.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {outputs.data.map((output) => (
                    <li key={output.id} className="flex items-center justify-between gap-3 py-2.5">
                      <Link href={`${props.toolPath}/${output.id}`} className="min-w-0 text-sm font-medium text-primary hover:underline">
                        <span className="block truncate">{output.title}</span>
                        <span className="text-xs font-normal text-muted-foreground">{formatDateTime(output.created_at)}</span>
                      </Link>
                      <StatusBadge status={output.status} />
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
