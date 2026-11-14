import { PROVENANCE, PROVENANCE_ORDER } from "@/config/provenance";
import { cn } from "@/lib/utils";
import type { ResultItem } from "@/types/legal";
import { SourceCitation } from "./source-citation";

/** One typed result line. Distinguished by colour, icon AND text label (never colour alone). */
export function ProvenanceItem({ item }: { item: ResultItem }) {
  const style = PROVENANCE[item.type];
  const Icon = style.icon;
  const missingCitation = item.type === "source" && (!item.citations || item.citations.length === 0);

  return (
    <li className={cn("rounded-md border-s-[3px] px-4 py-3", style.border, style.soft)}>
      <p className={cn("mb-1 flex items-center gap-1.5 text-xs font-semibold", style.text)}>
        <Icon className="size-3.5" aria-hidden />
        {style.labelAr}
        <span lang="en" className="font-normal opacity-80">
          · {style.labelEn}
        </span>
      </p>
      <p className="text-sm leading-7 text-foreground">
        {item.text}
        {item.citations?.map((citation, index) => (
          <SourceCitation key={`${citation.documentId}-${citation.page}-${index}`} citation={citation} index={index + 1} />
        ))}
      </p>
      {missingCitation ? (
        <p className="mt-1 text-xs font-medium text-verify">
          تنبيه: عنصر مصنّف كمستند إلى المصدر دون إحالة — يُعامل كعنصر يتطلب تحققًا.
        </p>
      ) : null}
    </li>
  );
}

/** Legend explaining the four provenance categories. */
export function ProvenanceLegend({ compact = false }: { compact?: boolean }) {
  return (
    <dl className={cn("grid gap-2", compact ? "grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2")}>
      {PROVENANCE_ORDER.map((type) => {
        const style = PROVENANCE[type];
        const Icon = style.icon;
        return (
          <div key={type} className={cn("rounded-md border-s-[3px] px-3 py-2", style.border, style.soft)}>
            <dt className={cn("flex items-center gap-1.5 text-xs font-semibold", style.text)}>
              <Icon className="size-3.5" aria-hidden />
              {style.labelAr}
            </dt>
            {compact ? null : <dd className="mt-1 text-xs leading-5 text-muted-foreground">{style.descriptionAr}</dd>}
          </div>
        );
      })}
    </dl>
  );
}
