"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Filter, Scale, Users } from "lucide-react";
import { EmptyState } from "@/components/legal/empty-state";
import { Button } from "@/components/ui/button";
import {
  CONTRADICTION_KIND_LABELS,
  EVIDENCE_TYPE_LABELS,
  MISSING_KIND_LABELS,
  type CaseMapClaim,
  type CaseMapContradiction,
  type CaseMapEvent,
  type CaseMapEvidence,
  type CaseMapMissing,
  type CaseMapParty,
} from "@/lib/tools/casemap/content";
import type { EvidenceType } from "@/lib/tools/casemap/model-schema";
import { cn } from "@/lib/utils";
import { describeDate, type MapLookup } from "./lookup";
import { Chip, Interpretation, ProvenanceTag, SourceChips } from "@/components/tools/shared/parts";
import { Timeline } from "./timeline";

/** A card that opens its item's sources. No nested interactive content. */
function ItemCard({
  onSelect,
  label,
  referenced,
  children,
  className,
}: {
  onSelect: () => void;
  label: string;
  referenced: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${label} — عرض المصدر`}
      className={cn(
        "w-full rounded-md border bg-surface p-3 text-start transition-colors hover:border-primary/60 hover:bg-surface-muted/40 focus-visible:outline-2 focus-visible:outline-primary",
        referenced ? "border-border" : "border-dashed border-verify/50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function NoResults({ filtered, what }: { filtered: boolean; what: string }) {
  return (
    <EmptyState
      title={filtered ? `لا توجد ${what} تطابق التصفية الحالية` : `لم تُستخرج ${what} من المصادر`}
      description={filtered ? "عدّل التصفية أو امسحها لعرض المزيد." : "لا تتوفر معلومات كافية في المستندات المرفوعة."}
      className="rounded-md border border-dashed border-border"
    />
  );
}

// ---------------------------------------------------------------------------

export function PartiesView({
  parties,
  claims,
  events,
  evidence,
  lookup,
  filtered,
  onFilterParty,
}: {
  parties: CaseMapParty[];
  claims: CaseMapClaim[];
  events: CaseMapEvent[];
  evidence: CaseMapEvidence[];
  lookup: MapLookup;
  filtered: boolean;
  onFilterParty: (id: string) => void;
}) {
  if (parties.length === 0) return <NoResults filtered={filtered} what="أطراف" />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {parties.map((party) => {
        const asClaimant = claims.filter((c) => c.claimant_ids.includes(party.id)).length;
        const asRespondent = claims.filter((c) => c.respondent_ids.includes(party.id)).length;
        const eventCount = events.filter((e) => e.party_ids.includes(party.id)).length;
        const evidenceCount = evidence.filter((e) => e.party_ids.includes(party.id)).length;
        return (
          <li key={party.id} className="flex flex-col gap-2">
            <ItemCard onSelect={() => lookup.select(party.id)} label={party.name} referenced={party.provenance === "source"} className="flex-1">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface-muted text-sm font-semibold text-primary" aria-hidden>
                  {party.name.trim().charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{party.name}</p>
                  <p className="text-sm text-muted-foreground">{party.role || "الدور غير مذكور"}</p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                {[
                  ["مدّعٍ في", asClaimant],
                  ["مدّعى عليه في", asRespondent],
                  ["وقائع", eventCount],
                  ["أدلة", evidenceCount],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-sm bg-surface-muted px-1 py-1.5">
                    <dt className="text-[10px] text-muted-foreground">{label}</dt>
                    <dd className="tabular text-sm font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <ProvenanceTag referenced={party.provenance === "source"} />
                <SourceChips links={lookup.links(party.reference_ids)} />
              </div>
            </ItemCard>
            <Button variant="ghost" size="sm" className="self-start" onClick={() => onFilterParty(party.id)}>
              <Filter aria-hidden />
              تصفية الخريطة بهذا الطرف
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------

export function ChronologyView({
  events,
  lookup,
  filtered,
  undatedHidden,
}: {
  events: CaseMapEvent[];
  lookup: MapLookup;
  filtered: boolean;
  undatedHidden: number;
}) {
  if (events.length === 0) return <NoResults filtered={filtered} what="وقائع" />;
  return (
    <div className="space-y-6">
      <Timeline events={events} lookup={lookup} />
      {undatedHidden > 0 ? (
        <p role="status" className="text-xs text-muted-foreground">
          أُخفيت {undatedHidden} واقعة بلا تاريخ بسبب تصفية التاريخ.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">الجدول الزمني للوقائع، مرتبًا من الأقدم إلى الأحدث</caption>
          <thead className="bg-surface-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">التاريخ</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">الواقعة</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">الأطراف</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">المصدر</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-surface">
            {events.map((event) => {
              const date = describeDate(event.date);
              return (
                <tr key={event.id} className="align-top hover:bg-surface-muted/40">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="tabular block font-medium">{date.primary}</span>
                    {date.secondary ? <span className="tabular block text-xs text-muted-foreground">{date.secondary}</span> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={() => lookup.select(event.id)} className="text-start font-medium text-primary hover:underline">
                      {event.title}
                    </button>
                    {event.description ? <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{event.description}</p> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {event.party_ids.map((id) => (
                        <Chip key={id}>{lookup.partyName(id)}</Chip>
                      ))}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {event.provenance === "source" ? <SourceChips links={lookup.links(event.reference_ids)} /> : <ProvenanceTag referenced={false} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ClaimsView({
  claims,
  events,
  evidence,
  lookup,
  filtered,
}: {
  claims: CaseMapClaim[];
  events: CaseMapEvent[];
  evidence: CaseMapEvidence[];
  lookup: MapLookup;
  filtered: boolean;
}) {
  if (claims.length === 0) return <NoResults filtered={filtered} what="مطالبات" />;
  return (
    <div className="space-y-5">
      <p className="text-xs text-muted-foreground">تعرض المواقف كما وردت في المصادر، دون ترجيح أو تقييم لأي منها.</p>
      {claims.map((claim) => (
        <article key={claim.id} className="rounded-lg border border-border bg-surface">
          <header className="border-b border-border p-4">
            <ItemCard onSelect={() => lookup.select(claim.id)} label={claim.title} referenced={claim.provenance === "source"} className="border-0 p-0 hover:bg-transparent">
              <h3 className="flex items-center gap-2 font-semibold">
                <Scale className="size-4 text-accent" aria-hidden />
                {claim.title}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {claim.claimant_ids.map((id) => (
                  <Chip key={id} tone="accent">{lookup.partyName(id)}</Chip>
                ))}
                <ArrowLeft className="size-3.5 text-muted-foreground" aria-label="ضد" />
                {claim.respondent_ids.length ? claim.respondent_ids.map((id) => <Chip key={id}>{lookup.partyName(id)}</Chip>) : <Chip>غير محدد</Chip>}
                <span className="text-muted-foreground">
                  · {events.filter((e) => e.claim_ids.includes(claim.id)).length} وقائع · {evidence.filter((e) => e.claim_ids.includes(claim.id)).length} أدلة
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <ProvenanceTag referenced={claim.provenance === "source"} />
                <SourceChips links={lookup.links(claim.reference_ids)} />
              </div>
            </ItemCard>
          </header>
          {claim.positions.length === 0 ? (
            <p className="p-4 text-sm text-missing">لم تُستخرج مواقف الأطراف من المصادر.</p>
          ) : (
            <ul className="grid gap-3 p-4 md:grid-cols-2">
              {claim.positions.map((position, index) => (
                <li key={`${claim.id}:${index}`}>
                  <ItemCard
                    onSelect={() => lookup.select(`${claim.id}:${index}`)}
                    label={`موقف ${lookup.partyName(position.party_id)}`}
                    referenced={position.provenance === "source"}
                    className="h-full"
                  >
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">موقف {lookup.partyName(position.party_id)}</p>
                    <p className="text-sm leading-7">{position.position}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ProvenanceTag referenced={position.provenance === "source"} />
                      <SourceChips links={lookup.links(position.reference_ids)} />
                    </div>
                  </ItemCard>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function EvidenceView({
  evidence,
  claims,
  lookup,
  filtered,
  activeType,
  onFilterType,
}: {
  evidence: CaseMapEvidence[];
  claims: CaseMapClaim[];
  lookup: MapLookup;
  filtered: boolean;
  activeType: EvidenceType | null;
  onFilterType: (type: EvidenceType | null) => void;
}) {
  if (evidence.length === 0) return <NoResults filtered={filtered} what="أدلة" />;
  const counts = new Map<EvidenceType, number>();
  evidence.forEach((item) => counts.set(item.evidence_type, (counts.get(item.evidence_type) ?? 0) + 1));
  const groups = [
    ...claims.map((claim) => ({ id: claim.id, title: claim.title, items: evidence.filter((e) => e.claim_ids.includes(claim.id)) })),
    { id: "unlinked", title: "غير مرتبط بمطالبة محددة", items: evidence.filter((e) => e.claim_ids.length === 0) },
  ].filter((group) => group.items.length > 0);

  return (
    <div className="space-y-5">
      <div role="group" aria-label="أنواع الأدلة" className="flex flex-wrap gap-2">
        {[...counts.entries()].map(([type, count]) => (
          <button
            key={type}
            type="button"
            aria-pressed={activeType === type}
            onClick={() => onFilterType(activeType === type ? null : type)}
            className={cn(
              "tabular inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs",
              activeType === type ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:bg-surface-muted",
            )}
          >
            {EVIDENCE_TYPE_LABELS[type]} <span className="opacity-75">{count}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {groups.map((group) => (
          <section key={group.id} aria-label={group.title} className="rounded-lg border border-border bg-surface-muted/40 p-3">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Scale className="size-4 text-accent" aria-hidden />
              {group.title}
              <span className="tabular text-xs font-normal text-muted-foreground">({group.items.length})</span>
            </h3>
            <ul className="space-y-2">
              {group.items.map((item) => {
                const links = lookup.links(item.reference_ids);
                return (
                  <li key={`${group.id}-${item.id}`}>
                    <ItemCard onSelect={() => lookup.select(item.id)} label={item.description} referenced={item.provenance === "source"}>
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <Chip tone="accent">{EVIDENCE_TYPE_LABELS[item.evidence_type]}</Chip>
                        {links[0] ? (
                          <bdi className="truncate text-xs text-muted-foreground">{links[0].documentName}</bdi>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium leading-6">{item.description}</p>
                      {links[0] ? (
                        <blockquote className="mt-2 border-s-2 border-source ps-2 font-serif text-sm leading-7 text-muted-foreground">«{links[0].excerpt}»</blockquote>
                      ) : null}
                      {item.supports ? <Interpretation className="mt-2">{item.supports}</Interpretation> : null}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <ProvenanceTag referenced={item.provenance === "source"} />
                        <SourceChips links={links} />
                      </div>
                    </ItemCard>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ContradictionsView({ contradictions, lookup, filtered }: { contradictions: CaseMapContradiction[]; lookup: MapLookup; filtered: boolean }) {
  if (contradictions.length === 0) {
    return filtered ? (
      <NoResults filtered what="تعارضات" />
    ) : (
      <EmptyState title="لم يُرصد تعارض بين المصادر" description="هذا لا يعني عدم وجود تعارض؛ تحقق أثناء المراجعة." className="rounded-md border border-dashed border-border" />
    );
  }
  return (
    <div className="space-y-5">
      {contradictions.map((item) => (
        <article key={item.id} className="rounded-lg border border-verify/30 bg-surface">
          <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <Chip tone="accent">{CONTRADICTION_KIND_LABELS[item.kind]}</Chip>
            <h3 className="font-semibold">{item.topic}</h3>
          </header>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {item.statements.map((statement, index) => {
              const links = lookup.links(statement.reference_ids);
              return (
                <ItemCard key={statement.id} onSelect={() => lookup.select(statement.id)} label={`إفادة ${index + 1}`} referenced={statement.provenance === "source"}>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">
                    إفادة {index + 1}
                    {links[0] ? (
                      <>
                        {" · "}
                        <bdi>{links[0].documentName}</bdi>
                      </>
                    ) : null}
                  </p>
                  <p className="text-sm leading-7">{statement.text}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ProvenanceTag referenced={statement.provenance === "source"} />
                    <SourceChips links={links} />
                  </div>
                </ItemCard>
              );
            })}
          </div>
          {item.interpretation ? (
            <div className="px-4 pb-4">
              <Interpretation>{item.interpretation}</Interpretation>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function MissingView({ missing, lookup, filtered }: { missing: CaseMapMissing[]; lookup: MapLookup; filtered: boolean }) {
  if (missing.length === 0) {
    return filtered ? (
      <NoResults filtered what="معلومات ناقصة" />
    ) : (
      <EmptyState title="لم تُحدَّد معلومات ناقصة" description="تحقق من ذلك أثناء المراجعة." icon={Users} className="rounded-md border border-dashed border-border" />
    );
  }
  return (
    <ul className="space-y-2">
      {missing.map((item) => (
        <li key={item.id}>
          <ItemCard onSelect={() => lookup.select(item.id)} label={item.text} referenced={item.reference_ids.length > 0} className="border-s-[3px] border-s-missing bg-missing-soft/40">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-missing">{MISSING_KIND_LABELS[item.kind]}</span>
              {item.claim_ids.map((id) => (
                <Chip key={id}>{lookup.claimTitle(id)}</Chip>
              ))}
            </div>
            <p className="mt-1 text-sm leading-7">{item.text}</p>
            <SourceChips links={lookup.links(item.reference_ids)} />
          </ItemCard>
        </li>
      ))}
    </ul>
  );
}
