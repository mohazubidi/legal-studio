import { AlertTriangle, CircleDashed, FileCheck2, Sparkles, type LucideIcon } from "lucide-react";
import type { ProvenanceType } from "@/types/legal";

export interface ProvenanceStyle {
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  icon: LucideIcon;
  /** Tailwind classes — kept as literals so Tailwind can detect them. */
  text: string;
  soft: string;
  border: string;
}

/**
 * The four provenance categories every AI output must use.
 * Colour is never the only signal: each item also carries an icon and a text label.
 */
export const PROVENANCE: Record<ProvenanceType, ProvenanceStyle> = {
  source: {
    labelAr: "مستند إلى المصدر",
    labelEn: "Source-derived",
    descriptionAr: "معلومة مأخوذة مباشرة من مستند مرفق، مع إحالة إلى موضعها.",
    icon: FileCheck2,
    text: "text-source",
    soft: "bg-source-soft",
    border: "border-source",
  },
  analysis: {
    labelAr: "تحليل الذكاء الاصطناعي",
    labelEn: "AI analysis",
    descriptionAr: "استنتاج أو تصنيف أنتجه النموذج، وليس نصًا واردًا في المصدر.",
    icon: Sparkles,
    text: "text-analysis",
    soft: "bg-analysis-soft",
    border: "border-analysis",
  },
  missing: {
    labelAr: "معلومات ناقصة",
    labelEn: "Missing information",
    descriptionAr: "معلومة لازمة لم ترد في المستندات المقدمة.",
    icon: CircleDashed,
    text: "text-missing",
    soft: "bg-missing-soft",
    border: "border-missing",
  },
  verify: {
    labelAr: "يتطلب تحققًا بشريًا",
    labelEn: "Requires human verification",
    descriptionAr: "مسألة يجب أن يتحقق منها المختص قبل الاعتماد.",
    icon: AlertTriangle,
    text: "text-verify",
    soft: "bg-verify-soft",
    border: "border-verify",
  },
};

export const PROVENANCE_ORDER: readonly ProvenanceType[] = ["source", "analysis", "missing", "verify"];
