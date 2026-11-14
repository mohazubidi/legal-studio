import { ClipboardList, Compass, FileText, GitCompare, Network, PenLine } from "lucide-react";
import type { ToolDefinition, ToolId } from "@/types/legal";

/** Single source of truth for the six legal tools (Dashboard + Tools pages). */
export const TOOLS: readonly ToolDefinition[] = [
  {
    id: "legal-memo",
    nameAr: "المذكرة القانونية",
    nameEn: "Legal Memo",
    descriptionAr: "إعداد مذكرات قانونية منظمة تربط الوقائع بالأسانيد النظامية.",
    icon: FileText,
    status: "coming_soon",
  },
  {
    id: "casemap",
    nameAr: "خريطة القضية",
    nameEn: "CaseMap",
    descriptionAr: "تنظيم الوقائع والأطراف والتسلسل الزمني والمسائل محل النزاع.",
    icon: Network,
    status: "coming_soon",
  },
  {
    id: "contract-compass",
    nameAr: "بوصلة العقود",
    nameEn: "Contract Compass",
    descriptionAr: "مراجعة بنود العقود وتحديد مواطن المخاطر والبنود الناقصة.",
    icon: Compass,
    status: "coming_soon",
  },
  {
    id: "regdelta",
    nameAr: "فروقات الأنظمة",
    nameEn: "RegDelta",
    descriptionAr: "مقارنة التعديلات النظامية وبيان أثرها على الالتزامات القائمة.",
    icon: GitCompare,
    status: "coming_soon",
  },
  {
    id: "matter-intake",
    nameAr: "استقبال القضايا",
    nameEn: "Matter Intake",
    descriptionAr: "استقبال منظم للقضايا الجديدة وتحديد المعلومات الناقصة مبكرًا.",
    icon: ClipboardList,
    status: "coming_soon",
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
