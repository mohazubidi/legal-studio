"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, CalendarRange, FileWarning, GitCompareArrows, Library, Scale, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CaseMapContent } from "@/lib/tools/casemap/content";
import {
  activeFilterCount,
  CASEMAP_VIEWS,
  EMPTY_FILTERS,
  filterCaseMap,
  findCaseMapItem,
  getSourceLinks,
  numberCaseMapReferences,
  serializeFilters,
  type CaseMapFilters,
  type CaseMapItemRef,
  type CaseMapView,
} from "@/lib/tools/casemap/explore";
import type { SourceReferenceRow } from "@/types/database";
import { FilterBar } from "./filter-bar";
import type { MapLookup } from "./lookup";
import { Tabs } from "@/components/legal/tabs";
import { SourceSheet } from "@/components/tools/shared/source-sheet";
import { ChronologyView, ClaimsView, ContradictionsView, EvidenceView, MissingView, PartiesView } from "./views";

const ITEM_KIND_LABELS: Record<CaseMapItemRef["kind"], string> = {
  party: "طرف",
  claim: "مطالبة",
  position: "موقف طرف",
  event: "واقعة",
  evidence: "دليل",
  statement: "إفادة متعارضة",
  missing: "معلومة ناقصة",
};

const VIEW_META: Record<CaseMapView, { label: string; icon: LucideIcon }> = {
  parties: { label: "الأطراف", icon: Users },
  chronology: { label: "التسلسل الزمني", icon: CalendarRange },
  claims: { label: "المطالبات والمواقف", icon: Scale },
  evidence: { label: "خريطة الأدلة", icon: Library },
  contradictions: { label: "التعارضات", icon: GitCompareArrows },
  missing: { label: "المعلومات الناقصة", icon: FileWarning },
};

interface CaseMapExplorerProps {
  /** Null for the illustrative sample (no URL sync, no file links). */
  outputId: string | null;
  content: CaseMapContent;
  references: SourceReferenceRow[];
  initialFilters?: CaseMapFilters;
  initialView?: CaseMapView;
  initialItem?: string | null;
  isSample?: boolean;
}

export function CaseMapExplorer({
  outputId,
  content,
  references,
  initialFilters = EMPTY_FILTERS,
  initialView = "parties",
  initialItem = null,
  isSample = false,
}: CaseMapExplorerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<CaseMapFilters>(initialFilters);
  const [view, setView] = useState<CaseMapView>(initialView);
  const [selectedId, setSelectedId] = useState<string | null>(initialItem);

  /** Keeps the URL shareable: filters, view and the open item. */
  const syncUrl = useCallback(
    (next: { filters: CaseMapFilters; view: CaseMapView; item: string | null }) => {
      if (!outputId) return;
      const params = serializeFilters(next.filters);
      params.set("view", next.view);
      if (next.item) params.set("item", next.item);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [outputId, pathname, router],
  );

  const numbers = useMemo(() => numberCaseMapReferences(content), [content]);
  const filtered = useMemo(() => filterCaseMap(content, references, filters), [content, references, filters]);
  const isFiltered = activeFilterCount(filters) > 0;

  const lookup: MapLookup = useMemo(() => {
    const parties = new Map(content.parties.map((p) => [p.id, p.name]));
    const claims = new Map(content.claims.map((c) => [c.id, c.title]));
    return {
      partyName: (id) => parties.get(id) ?? "طرف غير معرّف",
      claimTitle: (id) => claims.get(id) ?? "مطالبة غير معرّفة",
      links: (ids) => getSourceLinks(ids, references, content, numbers),
      select: (id) => {
        setSelectedId(id);
        syncUrl({ filters, view, item: id });
      },
    };
  }, [content, references, numbers, filters, view, syncUrl]);

  const selected = selectedId ? findCaseMapItem(content, selectedId) : null;

  function changeFilters(next: CaseMapFilters) {
    setFilters(next);
    syncUrl({ filters: next, view, item: null });
  }

  function changeView(next: CaseMapView) {
    setView(next);
    syncUrl({ filters, view: next, item: null });
  }

  const counts: Record<CaseMapView, number> = {
    parties: filtered.parties.length,
    chronology: filtered.events.length,
    claims: filtered.claims.length,
    evidence: filtered.evidence.length,
    contradictions: filtered.contradictions.length,
    missing: filtered.missing.length,
  };
  const failedSources = content.sources.filter((s) => !s.included);

  return (
    <div className="space-y-5">
      {isSample ? (
        <p role="note" className="rounded-md border border-accent/40 bg-accent-soft px-4 py-2 text-sm">
          <span className="font-semibold">مثال توضيحي بمصادر خيالية.</span> بُني بنفس قواعد التحقق: إحدى الوقائع اقتبست نصًا غير موجود فاستُبعد استشهادها ووُسمت بأنها غير موثّقة.
        </p>
      ) : null}

      {content.warnings.length > 0 || failedSources.length > 0 ? (
        <div role="status" className="rounded-md border border-verify/30 bg-verify-soft px-4 py-3 text-sm text-verify">
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4" aria-hidden />
            بيانات جزئية — تتطلب مراجعة
          </p>
          <ul className="list-disc space-y-0.5 ps-5">
            {content.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <FilterBar content={content} filters={filters} onChange={changeFilters} />

      <div>
        <Tabs
          label="عروض خريطة القضية"
          items={CASEMAP_VIEWS.map((key) => ({ key, label: VIEW_META[key].label, icon: VIEW_META[key].icon, count: counts[key] }))}
          value={view}
          onChange={changeView}
        >
          {view === "parties" ? (
            <PartiesView
              parties={filtered.parties}
              claims={content.claims}
              events={content.events}
              evidence={content.evidence}
              lookup={lookup}
              filtered={isFiltered}
              onFilterParty={(id) => changeFilters({ ...filters, party: id })}
            />
          ) : null}
          {view === "chronology" ? (
            <ChronologyView events={filtered.events} lookup={lookup} filtered={isFiltered} undatedHidden={filtered.undatedHidden} />
          ) : null}
          {view === "claims" ? <ClaimsView claims={filtered.claims} events={content.events} evidence={content.evidence} lookup={lookup} filtered={isFiltered} /> : null}
          {view === "evidence" ? (
            <EvidenceView
              evidence={filtered.evidence}
              claims={content.claims}
              lookup={lookup}
              filtered={isFiltered}
              activeType={filters.evidenceType}
              onFilterType={(type) => changeFilters({ ...filters, evidenceType: type })}
            />
          ) : null}
          {view === "contradictions" ? <ContradictionsView contradictions={filtered.contradictions} lookup={lookup} filtered={isFiltered} /> : null}
          {view === "missing" ? <MissingView missing={filtered.missing} lookup={lookup} filtered={isFiltered} /> : null}
        </Tabs>
      </div>

      <SourceSheet
        item={
          selected
            ? {
                kindLabel: ITEM_KIND_LABELS[selected.kind],
                title: selected.title,
                detail: selected.detail,
                interpretation: selected.interpretation,
                referenced: selected.referenced,
              }
            : null
        }
        links={selected ? lookup.links(selected.referenceIds) : []}
        linksEnabled={!isSample}
        onClose={() => {
          setSelectedId(null);
          syncUrl({ filters, view, item: null });
        }}
      />
    </div>
  );
}
