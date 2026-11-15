import { ClipboardList, Compass, FileText, GitCompare, Network, PenLine } from "lucide-react";
import type { ToolDefinition, ToolId } from "@/types/legal";

/** Single source of truth for the six legal tools (Dashboard + Tools pages). */
export const TOOLS: readonly ToolDefinition[] = [
  {
    id: "legal-memo",
    nameAr: "المذكرة القانونية",
    nameEn: "Legal Memo",
    descriptionAr: "تحويل مصادر الملف إلى مسودة مذكرة منظمة: وقائع بإحالات، معلومات ناقصة، ومسائل مقترحة للمراجعة.",
    icon: FileText,
    status: "available",
  },
  {
    id: "casemap",
    nameAr: "خريطة القضية",
    nameEn: "CaseMap",
    descriptionAr: "خريطة تفاعلية للأطراف والتسلسل الزمني والمطالبات والأدلة والتعارضات، مرتبطة بمصادرها.",
    icon: Network,
    status: "available",
  },
  {
    id: "contract-compass",
    nameAr: "بوصلة العقود",
    nameEn: "Contract Compass",
    descriptionAr: "عرض تشغيلي للعقد: الالتزامات والمواعيد والشروط المالية، مع بنود تستحق المراجعة ومعلومات ناقصة.",
    icon: Compass,
    status: "available",
  },
  {
    id: "regdelta",
    nameAr: "فروقات الأنظمة",
    nameEn: "RegDelta",
    descriptionAr: "مقارنة هيكلية بين نسختين من نص تنظيمي: الأحكام المضافة والمحذوفة والمعدّلة، مع الأثر التشغيلي المحتمل وقائمة امتثال أولية.",
    icon: GitCompare,
    status: "available",
  },
  {
    id: "matter-intake",
    nameAr: "استقبال القضايا",
    nameEn: "Matter Intake",
    descriptionAr: "استقبال موجَّه لمعلومات العميل وتحويلها إلى ملخص منظم يحدد الناقص والتعارضات واستبيان المتابعة، قبل إنشاء الملف.",
    icon: ClipboardList,
    status: "available",
  },
  {
    id: "legal-content",
    nameAr: "المحتوى القانوني",
    nameEn: "Legal Content",
    descriptionAr: "صياغة محتوى توعوي قانوني دقيق بلغة واضحة للجمهور.",
    icon: PenLine,
    status: "coming_soon",
  },
];

export function getTool(id: string): ToolDefinition | undefined {
  return TOOLS.find((tool) => tool.id === id);
}

export function getToolName(id: ToolId): string {
  return getTool(id)?.nameAr ?? id;
}
