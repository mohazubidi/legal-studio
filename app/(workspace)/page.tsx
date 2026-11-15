import Link from "next/link";
import { Briefcase, ClipboardCheck, FileStack } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { StatCard } from "@/components/legal/stat-card";
import { ToolCard } from "@/components/legal/tool-card";
import { SAMPLE_DOCUMENT_COUNT, SAMPLE_MATTER_ITEMS, SAMPLE_OUTPUT_ITEMS, outputItems } from "@/components/workspace/rows";
import { RecentOutputsTable, type OutputListItem } from "@/components/workspace/outputs-table";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TOOLS } from "@/config/tools";
import { listMatters } from "@/lib/data/matters";
import { listAllDocuments, listAllOutputs, workspaceSource } from "@/lib/data/workspace";
import { getSessionState } from "@/lib/supabase/server";

interface Overview {
  activeMatters: number;
  totalMatters: number;
  documents: number;
  pendingReview: number;
  recent: OutputListItem[];
}

async function loadOverview(): Promise<{ ok: true; data: Overview } | { ok: false; message: string }> {
  const source = await workspaceSource();
  if (source.kind === "preview") {
    return {
      ok: true,
      data: {
        activeMatters: SAMPLE_MATTER_ITEMS.filter((m) => m.status === "active").length,
        totalMatters: SAMPLE_MATTER_ITEMS.length,
        documents: SAMPLE_DOCUMENT_COUNT,
        pendingReview: SAMPLE_OUTPUT_ITEMS.filter((o) => o.status !== "approved").length,
        recent: SAMPLE_OUTPUT_ITEMS.slice(0, 3),
      },
    };
  }
  const [matters, documents, outputs] = await Promise.all([
    listMatters(source.supabase),
    listAllDocuments(source.supabase),
    listAllOutputs(source.supabase),
  ]);
  const failed = [matters, documents, outputs].find((r) => !r.ok);
  if (failed && !failed.ok) return { ok: false, message: failed.error.message };
  if (!matters.ok || !documents.ok || !outputs.ok) return { ok: false, message: "تعذّر تحميل البيانات." };
  return {
    ok: true,
    data: {
      activeMatters: matters.data.filter((m) => m.status === "active").length,
      totalMatters: matters.data.length,
      documents: documents.data.length,
      // Anything not yet explicitly approved still needs a professional's review.
      pendingReview: outputs.data.filter((o) => o.status !== "approved").length,
      recent: outputItems(outputs.data.slice(0, 5)),
    },
  };
}

export default async function DashboardPage() {
  const session = await getSessionState();
  const name = session.kind === "authenticated" ? session.profile.fullName : null;
  const overview = await loadOverview();

  return (
    <>
      <PageHeader
        titleEn="Dashboard"
        title={name ? `مرحبًا، ${name}` : "لوحة التحكم"}
        description="نظرة عامة على الملفات والمستندات والمخرجات التي تنتظر المراجعة، والأدوات المتاحة."
      />

      {overview.ok ? (
        <section aria-label="ملخص" className="mb-10 grid gap-4 sm:grid-cols-3">
          <StatCard label="ملفات قائمة" value={overview.data.activeMatters} icon={Briefcase} hint={`من أصل ${overview.data.totalMatters} ملفات`} />
          <StatCard label="مستندات" value={overview.data.documents} icon={FileStack} />
          <StatCard label="مخرجات بانتظار المراجعة" value={overview.data.pendingReview} icon={ClipboardCheck} />
        </section>
      ) : (
        <div className="mb-10">
          <ErrorState title="تعذّر تحميل الملخص" description={overview.message} />
        </div>
      )}

      <section aria-labelledby="tools-heading" className="mb-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 id="tools-heading" className="text-lg font-semibold">
            الأدوات القانونية
          </h2>
          <Link href="/tools" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            جميع الأدوات
          </Link>
        </div>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((tool) => (
            <li key={tool.id}>
              <ToolCard tool={tool} />
            </li>
          ))}
        </ul>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>أحدث المخرجات</CardTitle>
          <Link href="/outputs" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            عرض الكل
          </Link>
        </CardHeader>
        <RecentOutputsTable outputs={overview.ok ? overview.data.recent : []} error={overview.ok ? null : overview.message} />
      </Card>
    </>
  );
}
