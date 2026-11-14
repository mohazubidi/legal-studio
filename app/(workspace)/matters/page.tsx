import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/legal/page-header";
import { MattersTable } from "@/components/workspace/matters-table";
import { Button } from "@/components/ui/button";
import { MATTERS } from "@/data/mock";

export const metadata: Metadata = { title: "القضايا والملفات" };

export default function MattersPage() {
  return (
    <>
      <PageHeader
        titleEn="Matters"
        title="القضايا والملفات"
        description="جميع الملفات القانونية ومستنداتها ومخرجاتها في مكان واحد."
        actions={
          <Button disabled title="سيتوفر مع أداة استقبال القضايا">
            <Plus aria-hidden />
            ملف جديد
          </Button>
        }
      />
      <MattersTable matters={MATTERS} />
    </>
  );
}
