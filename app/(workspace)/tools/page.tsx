import type { Metadata } from "next";
import { PageHeader } from "@/components/legal/page-header";
import { ToolCard } from "@/components/legal/tool-card";
import { TOOLS } from "@/config/tools";

export const metadata: Metadata = { title: "الأدوات" };

export default function ToolsPage() {
  return (
    <>
      <PageHeader
        titleEn="Tools"
        title="الأدوات"
        description="كل أداة تنتج مخرجًا مصنّفًا: ما هو مستند إلى المصدر، وما هو تحليل، وما هو ناقص، وما يتطلب تحققًا بشريًا."
      />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((tool) => (
          <li key={tool.id}>
            <ToolCard tool={tool} />
          </li>
        ))}
      </ul>
    </>
  );
}
