import type { Metadata } from "next";
import { PageHeader } from "@/components/legal/page-header";
import { RecentOutputsTable } from "@/components/workspace/outputs-table";
import { SAMPLE_OUTPUT_ITEMS, outputItems } from "@/components/workspace/rows";
import { Card } from "@/components/ui/card";
import { listAllOutputs, workspaceSource } from "@/lib/data/workspace";

export const metadata: Metadata = { title: "المخرجات" };

export default async function OutputsPage() {
  const source = await workspaceSource();
  const outputs = source.kind === "preview" ? null : await listAllOutputs(source.supabase);

  return (
    <>
      <PageHeader
        titleEn="Outputs"
        title="المخرجات"
        description="كل مخرج يبقى مسودة أو بانتظار المراجعة حتى يعتمده مختص صراحةً."
      />
      <Card>
        <RecentOutputsTable
          outputs={outputs === null ? SAMPLE_OUTPUT_ITEMS : outputs.ok ? outputItems(outputs.data) : []}
          error={outputs && !outputs.ok ? outputs.error.message : null}
        />
      </Card>
    </>
  );
}
