import type { Metadata } from "next";
import { PageHeader } from "@/components/legal/page-header";
import { RecentOutputsTable } from "@/components/workspace/outputs-table";
import { Card } from "@/components/ui/card";
import { OUTPUTS } from "@/data/mock";

export const metadata: Metadata = { title: "المخرجات" };

export default function OutputsPage() {
  return (
    <>
      <PageHeader
        titleEn="Outputs"
        title="المخرجات"
        description="كل مخرج يبقى مسودة أو بانتظار المراجعة حتى يعتمده مختص صراحةً."
      />
      <Card>
        <RecentOutputsTable outputs={OUTPUTS} />
      </Card>
    </>
  );
}
