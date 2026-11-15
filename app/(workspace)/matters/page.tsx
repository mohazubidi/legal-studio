import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { MattersTable } from "@/components/workspace/matters-table";
import { SAMPLE_MATTER_ITEMS, matterItems } from "@/components/workspace/rows";
import { Button } from "@/components/ui/button";
import { listMatters } from "@/lib/data/matters";
import { workspaceSource } from "@/lib/data/workspace";

export const metadata: Metadata = { title: "القضايا والملفات" };

export default async function MattersPage() {
  const source = await workspaceSource();
  const matters = source.kind === "preview" ? null : await listMatters(source.supabase);

  const newMatter =
    source.kind === "preview" ? (
      <Button disabled title="يتطلب قاعدة البيانات">
        <Plus aria-hidden />
        ملف جديد
      </Button>
    ) : (
      <Button asChild>
        <Link href="/matters/new">
          <Plus aria-hidden />
          ملف جديد
        </Link>
      </Button>
    );

  return (
    <>
      <PageHeader
        titleEn="Matters"
        title="القضايا والملفات"
        description="جميع الملفات القانونية ومستنداتها ومخرجاتها في مكان واحد."
        actions={newMatter}
      />
      {matters && !matters.ok ? (
        <ErrorState title="تعذّر تحميل الملفات" description={matters.error.message} />
      ) : (
        <MattersTable matters={matters ? matterItems(matters.data) : SAMPLE_MATTER_ITEMS} emptyAction={newMatter} />
      )}
    </>
  );
}
