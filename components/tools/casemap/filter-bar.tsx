"use client";

import { useId, useState } from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EVIDENCE_TYPE_LABELS, type CaseMapContent } from "@/lib/tools/casemap/content";
import { activeFilterCount, EMPTY_FILTERS, type CaseMapFilters } from "@/lib/tools/casemap/explore";
import { EVIDENCE_TYPES, type EvidenceType } from "@/lib/tools/casemap/model-schema";

interface FilterBarProps {
  content: CaseMapContent;
  filters: CaseMapFilters;
  onChange: (filters: CaseMapFilters) => void;
}

const selectClass = "block h-9 w-full rounded-md border border-border-strong bg-surface px-2 text-sm";

export function FilterBar({ content, filters, onChange }: FilterBarProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const active = activeFilterCount(filters);
  const set = <K extends keyof CaseMapFilters>(key: K, value: CaseMapFilters[K]) => onChange({ ...filters, [key]: value || null });

  return (
    <section aria-label="تصفية الخريطة" className="rounded-lg border border-border bg-surface p-4">
      <div className={cn("flex items-center justify-between gap-3 md:mb-3", open && "mb-3")}>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="size-4 text-muted-foreground" aria-hidden />
          التصفية
          {active > 0 ? <span className="tabular rounded-full bg-primary px-2 text-xs text-primary-foreground">{active}</span> : null}
        </h2>
        <div className="flex items-center gap-1">
          {active > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
              <X aria-hidden />
              مسح الكل
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            className="md:hidden"
            aria-expanded={open}
            aria-controls={`${id}-fields`}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "إخفاء" : "إظهار"}
          </Button>
        </div>
      </div>
      <div id={`${id}-fields`} className={cn("gap-3 sm:grid-cols-2 md:grid lg:grid-cols-3 xl:grid-cols-6", open ? "grid" : "hidden")}>
        <div className="space-y-1">
          <label htmlFor={`${id}-party`} className="text-xs font-medium text-muted-foreground">الطرف</label>
          <select id={`${id}-party`} className={selectClass} value={filters.party ?? ""} onChange={(e) => set("party", e.target.value)}>
            <option value="">الكل</option>
            {content.parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-claim`} className="text-xs font-medium text-muted-foreground">المطالبة</label>
          <select id={`${id}-claim`} className={selectClass} value={filters.claim ?? ""} onChange={(e) => set("claim", e.target.value)}>
            <option value="">الكل</option>
            {content.claims.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-document`} className="text-xs font-medium text-muted-foreground">المستند</label>
          <select id={`${id}-document`} className={selectClass} value={filters.document ?? ""} onChange={(e) => set("document", e.target.value)}>
            <option value="">الكل</option>
            {content.sources.filter((s) => s.included).map((s) => (
              <option key={s.document_id} value={s.document_id}>{`${s.label} · ${s.file_name}`}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-type`} className="text-xs font-medium text-muted-foreground">نوع الدليل</label>
          <select
            id={`${id}-type`}
            className={selectClass}
            value={filters.evidenceType ?? ""}
            onChange={(e) => set("evidenceType", (e.target.value || null) as EvidenceType | null)}
          >
            <option value="">الكل</option>
            {EVIDENCE_TYPES.map((type) => (
              <option key={type} value={type}>{EVIDENCE_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-from`} className="text-xs font-medium text-muted-foreground">من تاريخ (ميلادي)</label>
          <input id={`${id}-from`} type="date" dir="ltr" className={selectClass} value={filters.from ?? ""} max={filters.to ?? undefined} onChange={(e) => set("from", e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-to`} className="text-xs font-medium text-muted-foreground">إلى تاريخ (ميلادي)</label>
          <input id={`${id}-to`} type="date" dir="ltr" className={selectClass} value={filters.to ?? ""} min={filters.from ?? undefined} onChange={(e) => set("to", e.target.value)} />
        </div>
      </div>
      <p className={cn("mt-2 text-xs text-muted-foreground md:block", open ? "block" : "hidden")}>
        يُطبَّق كل فلتر على العناصر التي تحمل هذا البعد فقط؛ فلتر المستند يشمل كل العناصر عبر إحالاتها، وفلتر التاريخ يشمل الوقائع المؤرخة.
      </p>
    </section>
  );
}
