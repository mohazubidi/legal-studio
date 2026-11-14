import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AIResultPanel } from "@/components/legal/ai-result-panel";
import { DataTable, type DataTableColumn } from "@/components/legal/data-table";
import { EmptyState, ErrorState } from "@/components/legal/empty-state";
import { PageHeader } from "@/components/legal/page-header";
import { ProvenanceItem, ProvenanceLegend } from "@/components/legal/provenance";
import { SourceCitation } from "@/components/legal/source-citation";
import { StatusBadge } from "@/components/legal/status-badge";
import { ToolCard } from "@/components/legal/tool-card";
import { UploadArea } from "@/components/legal/upload-area";
import { ConfirmDialogDemo } from "@/components/workspace/confirm-dialog-demo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TOOLS } from "@/config/tools";
import { MATTERS, OUTPUTS } from "@/data/mock";
import type { Matter, StatusVariant } from "@/types/legal";

export const metadata: Metadata = { title: "نظام التصميم" };

const STATUSES: readonly StatusVariant[] = [
  "draft", "in_review", "reviewed", "active", "on_hold", "closed",
  "coming_soon", "processing", "failed", "source", "analysis", "missing", "verify",
];

const SWATCHES = [
  { name: "primary", className: "bg-primary" },
  { name: "accent", className: "bg-accent" },
  { name: "surface", className: "bg-surface" },
  { name: "background", className: "bg-background" },
  { name: "source", className: "bg-source" },
  { name: "analysis", className: "bg-analysis" },
  { name: "missing", className: "bg-missing" },
  { name: "verify", className: "bg-verify" },
] as const;

const MATTER_COLUMNS: readonly DataTableColumn<Matter>[] = [
  { id: "ref", header: "رقم الملف", cell: (row) => <span dir="ltr">{row.reference}</span>, numeric: true },
  { id: "title", header: "العنوان", cell: (row) => row.title },
  { id: "status", header: "الحالة", cell: (row) => <StatusBadge status={row.status} /> },
];

function Specimen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const SAMPLE_CITATION = OUTPUTS[0].result.sections[0].items[0].citations![0];

export default function DesignSystemPage() {
  return (
    <>
      <PageHeader
        titleEn="Design system"
        title="نظام التصميم"
        description="المكونات القابلة لإعادة الاستخدام وحالاتها. يُستخدم كمرجع عند بناء الأدوات."
      />

      <div className="space-y-6">
        <Specimen title="الألوان">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SWATCHES.map((swatch) => (
              <li key={swatch.name} className="rounded-md border border-border">
                <div className={`h-12 rounded-t-md ${swatch.className}`} />
                <p lang="en" className="px-3 py-2 text-xs text-muted-foreground">{swatch.name}</p>
              </li>
            ))}
          </ul>
        </Specimen>

        <Specimen title="الأزرار">
          <div className="flex flex-wrap gap-2">
            <Button>أساسي</Button>
            <Button variant="secondary">ثانوي</Button>
            <Button variant="ghost">شفاف</Button>
            <Button variant="destructive">حذف</Button>
            <Button disabled>معطّل</Button>
          </div>
        </Specimen>

        <Specimen title="شارات الحالة">
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
          </div>
        </Specimen>

        <Specimen title="تصنيف مخرجات الذكاء الاصطناعي">
          <ProvenanceLegend />
          <ul className="mt-4 space-y-2">
            {OUTPUTS[0].result.sections.flatMap((s) => s.items).map((item) => (
              <ProvenanceItem key={item.id} item={item} />
            ))}
          </ul>
        </Specimen>

        <Specimen title="الإحالة إلى المصدر">
          <p className="text-sm leading-7">
            نص يتضمن إحالة إلى موضع في المستند
            <SourceCitation citation={SAMPLE_CITATION} index={1} />
          </p>
        </Specimen>

        <Specimen title="بطاقة أداة">
          <div className="max-w-sm">
            <ToolCard tool={TOOLS[0]} />
          </div>
        </Specimen>

        <div className="grid gap-6 lg:grid-cols-2">
          <Specimen title="جدول — حالة التحميل">
            <DataTable caption="مثال تحميل" columns={MATTER_COLUMNS} rows={[]} getRowId={(r) => r.id} isLoading loadingRows={3} />
          </Specimen>
          <Specimen title="جدول — بيانات">
            <DataTable caption="مثال بيانات" columns={MATTER_COLUMNS} rows={MATTERS.slice(0, 3)} getRowId={(r) => r.id} />
          </Specimen>
          <Specimen title="حالة فارغة">
            <EmptyState title="لا توجد ملفات" description="ابدأ بإنشاء ملف جديد." />
          </Specimen>
          <Specimen title="حالة خطأ">
            <ErrorState title="تعذّر تحميل البيانات" description="تحقق من الاتصال ثم أعد المحاولة." />
          </Specimen>
        </div>

        <Specimen title="منطقة الرفع">
          <UploadArea pendingNotice="مثال: لا يتم حفظ الملفات." />
        </Specimen>

        <Specimen title="نافذة التأكيد">
          <ConfirmDialogDemo />
        </Specimen>

        <section aria-label="لوحة نتائج الذكاء الاصطناعي">
          <AIResultPanel result={OUTPUTS[0].result} />
        </section>
      </div>
    </>
  );
}
