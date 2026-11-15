import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/legal/page-header";
import { NewMatterForm } from "@/components/tools/shared/new-matter-form";
import { Card, CardContent } from "@/components/ui/card";
import { workspaceSource } from "@/lib/data/workspace";

export const metadata: Metadata = { title: "ملف جديد" };

export default async function NewMatterPage() {
  if ((await workspaceSource()).kind === "preview") redirect("/matters");
  return (
    <>
      <Link href="/matters" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        القضايا والملفات
      </Link>
      <PageHeader
        titleEn="New matter"
        title="ملف جديد"
        description="أنشئ الملف ثم ارفع مستنداته. لاستقبال عميل جديد بنموذج موجَّه استخدم أداة «استقبال القضايا»."
      />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <NewMatterForm basePath="/matters" />
        </CardContent>
      </Card>
    </>
  );
}
