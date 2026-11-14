import Link from "next/link";
import { Briefcase, ClipboardCheck, FileStack } from "lucide-react";
import { PageHeader } from "@/components/legal/page-header";
import { StatCard } from "@/components/legal/stat-card";
import { ToolCard } from "@/components/legal/tool-card";
import { RecentOutputsTable } from "@/components/workspace/outputs-table";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TOOLS } from "@/config/tools";
import { DOCUMENTS, MATTERS, OUTPUTS } from "@/data/mock";
import { getSessionState } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const session = await getSessionState();
  const name = session.kind === "authenticated" ? session.profile.fullName : null;

  const activeMatters = MATTERS.filter((m) => m.status === "active").length;
  const pendingReview = OUTPUTS.filter((o) => o.status !== "reviewed").length;

  return (
    <>
      <PageHeader
        titleEn="Dashboard"
        title={name ? `مرحبًا، ${name}` : "لوحة التحكم"}
        description="نظرة عامة على الملفات والمستندات والمخرجات التي تنتظر المراجعة، والأدوات المتاحة."
      />

      <section aria-label="ملخص" className="mb-10 grid gap-4 sm:grid-cols-3">
        <StatCard label="ملفات قائمة" value={activeMatters} icon={Briefcase} hint={`من أصل ${MATTERS.length} ملفات`} />
        <StatCard label="مستندات" value={DOCUMENTS.length} icon={FileStack} />
        <StatCard label="مخرجات بانتظار المراجعة" value={pendingReview} icon={ClipboardCheck} />
      </section>

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
        <RecentOutputsTable outputs={OUTPUTS.slice(0, 3)} />
      </Card>
    </>
  );
}
