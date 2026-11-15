"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, FileSearch, FileWarning, Landmark, ListChecks, Wallet } from "lucide-react";
import { setReviewMarkAction } from "@/app/(workspace)/tools/review-actions";
import { EmptyState } from "@/components/legal/empty-state";
import { Tabs } from "@/components/legal/tabs";
import { ActionMessage } from "@/components/tools/shared/action-message";
import { Chip, Interpretation, ProvenanceTag, SourceChips } from "@/components/tools/shared/parts";
import { SourceSheet } from "@/components/tools/shared/source-sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import type { ContractContent } from "@/lib/tools/contract-compass/content";
import { buildContractView, CONTRACT_VIEWS, findContractItem, NOT_SPECIFIED, type ContractView } from "@/lib/tools/contract-compass/view";
import { REVIEW_MARK_LABELS, type ReviewMark, type ReviewMarks } from "@/lib/tools/shared/review";
import { cn } from "@/lib/utils";
import type { SourceReferenceRow } from "@/types/database";

const VIEW_META: Record<ContractView, { label: string; icon: typeof ClipboardList }> = {
  snapshot: { label: "ملخص العقد", icon: FileSearch },
  obligations: { label: "مصفوفة الالتزامات", icon: ListChecks },
  deadlines: { label: "المواعيد والمهل", icon: CalendarClock },
  financial: { label: "الشروط المالية", icon: Wallet },
  review: { label: "بنود تستحق المراجعة", icon: ClipboardList },
  missing: { label: "الناقص وغير الواضح", icon: FileWarning },
};

export function parseContractView(value: string | null | undefined): ContractView {
  return (CONTRACT_VIEWS as readonly string[]).includes(value ?? "") ? (value as ContractView) : "snapshot";
}

function ClauseTag({ clause }: { clause: string | null }) {
  return clause ? (
    <span className="inline-flex h-5 items-center rounded-sm border border-border-strong bg-surface px-1.5 text-[11px] font-medium">{clause}</span>
  ) : (
    <span className="text-[11px] text-muted-foreground">رقم البند غير متحقق</span>
  );
}

function MarkBadge({ mark }: { mark: ReviewMark | undefined }) {
  if (!mark) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-[11px] font-medium",
        mark.status === "verified" ? "border-success/30 bg-success-soft text-success" : "border-danger/30 bg-danger-soft text-danger",
      )}
    >
      {mark.status === "verified" ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
      {REVIEW_MARK_LABELS[mark.status]}
    </span>
  );
}

/** A clickable card that opens the item's source. No nested interactive content. */
function ItemCard({ onSelect, label, referenced, children, className }: { onSelect: () => void; label: string; referenced: boolean; children: ReactNode; className?: string }) {
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

function Empty({ title, description }: { title: string; description?: string }) {
  return <EmptyState title={title} description={description} className="rounded-md border border-dashed border-border" />;
}

function ReviewMarkEditor({ outputId, itemId, mark }: { outputId: string; itemId: string; mark: ReviewMark | undefined }) {
  const router = useRouter();
  const [note, setNote] = useState(mark?.note ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(next: { status: ReviewMark["status"]; note: string } | null) {
    setError(null);
    startTransition(async () => {
      const result = await setReviewMarkAction(outputId, itemId, next);
      if (!result.ok) setError(result.message);
      router.refresh();
    });
  }

  return (
    <section aria-label="مراجعة هذا العنصر" className="space-y-2 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">مراجعة العنصر</h3>
      <p className="text-xs text-muted-foreground">تُحفظ علامة المراجعة منفصلة عن المحتوى المولّد، ولا تغيّر حالة الاعتماد.</p>
      <label htmlFor={`note-${itemId}`} className="sr-only">ملاحظة المراجع</label>
      <Textarea id={`note-${itemId}`} rows={3} value={note} maxLength={2000} placeholder="ملاحظة أو تصحيح (اختياري)" onChange={(e) => setNote(e.target.value)} />
      <ActionMessage message={error} tone="error" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mark?.status === "verified" ? "primary" : "secondary"} disabled={pending} onClick={() => save({ status: "verified", note })}>
          <CheckCircle2 aria-hidden />
          تم التحقق
        </Button>
        <Button size="sm" variant={mark?.status === "needs_change" ? "destructive" : "secondary"} disabled={pending} onClick={() => save({ status: "needs_change", note })}>
          <AlertTriangle aria-hidden />
          يحتاج تصحيحًا
        </Button>
        {mark ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(null)}>
            إزالة العلامة
          </Button>
        ) : null}
      </div>
    </section>
  );
}

interface ContractViewProps {
  outputId: string | null;
  content: ContractContent;
  references: SourceReferenceRow[];
  reviewMarks?: ReviewMarks;
  initialView?: ContractView;
  initialItem?: string | null;
  isSample?: boolean;
}

export function ContractCompassView({ outputId, content, references, reviewMarks = {}, initialView = "snapshot", initialItem = null, isSample = false }: ContractViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<ContractView>(initialView);
  const [selectedId, setSelectedId] = useState<string | null>(initialItem);
  const model = useMemo(() => buildContractView(content, references), [content, references]);
  const selected = selectedId ? findContractItem(model, selectedId) : null;

  const sync = useCallback(
    (nextView: ContractView, item: string | null) => {
      if (!outputId) return;
      const params = new URLSearchParams({ view: nextView });
      if (item) params.set("item", item);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [outputId, pathname, router],
  );
  const select = (id: string) => {
    setSelectedId(id);
    sync(view, id);
  };
  const changeView = (next: ContractView) => {
    setView(next);
    sync(next, null);
  };

  return (
    <div className="space-y-5">
      {isSample ? (
        <p role="note" className="rounded-md border border-accent/40 bg-accent-soft px-4 py-2 text-sm">
          <span className="font-semibold">مثال توضيحي بعقد خيالي.</span> بُني بقواعد التحقق نفسها: حُذف مبلغ غير موجود في العقد ورقم بند غير وارد في النص، واستُبدل وصف قاطع بصياغة مهنية.
        </p>
      ) : null}

      {content.warnings.length > 0 ? (
        <div role="status" className="rounded-md border border-verify/30 bg-verify-soft px-4 py-3 text-sm text-verify">
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4" aria-hidden />
            نتائج التحقق
          </p>
          <ul className="list-disc space-y-0.5 ps-5">
            {content.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Tabs
        label="عروض بوصلة العقود"
        items={CONTRACT_VIEWS.map((key) => ({ key, label: VIEW_META[key].label, icon: VIEW_META[key].icon, count: model.counts[key] }))}
        value={view}
        onChange={changeView}
      >
        {view === "snapshot" ? (
          <div className="space-y-6">
            <section aria-labelledby="parties-h">
              <h3 id="parties-h" className="mb-3 text-sm font-semibold">الأطراف المتعاقدة</h3>
              {model.parties.length === 0 ? (
                <Empty title="لم تُستخرج أطراف العقد" description="لا تتوفر معلومات كافية في المستندات المرفوعة." />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {model.parties.map((party) => (
                    <li key={party.id}>
                      <ItemCard onSelect={() => select(party.id)} label={party.name} referenced={party.referenced}>
                        <div className="flex items-center gap-3">
                          <Landmark className="size-5 shrink-0 text-accent" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold">{party.name}</p>
                            <p className="text-sm text-muted-foreground">{party.role || "الصفة غير مذكورة"}</p>
                          </div>
                          <MarkBadge mark={reviewMarks[party.id]} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <ProvenanceTag referenced={party.referenced} />
                          <SourceChips links={party.links} />
                        </div>
                      </ItemCard>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="terms-h">
              <h3 id="terms-h" className="mb-3 text-sm font-semibold">الشروط الأساسية</h3>
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {model.terms.map((term) => (
                  <li key={term.id}>
                    <ItemCard onSelect={() => select(term.id)} label={term.label} referenced={term.referenced || term.status === "not_stated"} className="h-full">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-muted-foreground">{term.label}</p>
                        <MarkBadge mark={reviewMarks[term.id]} />
                      </div>
                      <p className={cn("text-sm leading-6", term.status === "stated" ? "font-medium" : "text-muted-foreground")}>{term.value}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-medium",
                            term.status === "stated" && "border-source/30 bg-source-soft text-source",
                            term.status === "not_stated" && "border-border bg-surface-muted text-muted-foreground",
                            term.status === "unclear" && "border-missing/30 bg-missing-soft text-missing",
                            term.status === "unverified" && "border-verify/30 bg-verify-soft text-verify",
                          )}
                        >
                          {term.statusLabel}
                        </span>
                        {term.status !== "not_stated" ? <ClauseTag clause={term.clause} /> : null}
                        <SourceChips links={term.links} />
                      </div>
                    </ItemCard>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}

        {view === "obligations" ? (
          model.matrix.length === 0 ? (
            <Empty title="لم تُستخرج التزامات من العقد" description="لا تتوفر معلومات كافية في المستندات المرفوعة." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[860px] text-sm">
                <caption className="sr-only">مصفوفة الالتزامات: الالتزام، الطرف المسؤول، الموعد، البند، المصدر</caption>
                <thead className="bg-surface-muted text-xs text-muted-foreground">
                  <tr>
                    {["الالتزام", "الطرف المسؤول", "الموعد", "البند", "المصدر", "المراجعة"].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 text-start font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {model.matrix.map((row) => (
                    <tr key={row.id} className={cn("align-top hover:bg-surface-muted/40", !row.referenced && "bg-verify-soft/30")}>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => select(row.id)} className="text-start font-medium text-primary hover:underline">
                          {row.obligation}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex flex-wrap gap-1">
                          {row.responsible.map((name) => (
                            <Chip key={name}>{name}</Chip>
                          ))}
                        </span>
                      </td>
                      <td className={cn("px-3 py-2.5", row.deadline === NOT_SPECIFIED && "text-muted-foreground")}>{row.deadline}</td>
                      <td className="px-3 py-2.5"><ClauseTag clause={row.clause} /></td>
                      <td className="px-3 py-2.5">{row.referenced ? <SourceChips links={row.links} /> : <ProvenanceTag referenced={false} />}</td>
                      <td className="px-3 py-2.5"><MarkBadge mark={reviewMarks[row.id]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {view === "deadlines" ? (
          model.deadlines.length === 0 ? (
            <Empty title="لا توجد مواعيد أو مهل منصوص عليها" description="لم يحدد العقد مواعيد يمكن التحقق منها في النص." />
          ) : (
            <ol className="relative space-y-3 border-s-2 border-border ps-5">
              {model.deadlines.map((row) => (
                <li key={row.id} className="relative">
                  <span className={cn("absolute -start-[27px] top-4 size-3 rounded-full border-2 border-surface", row.iso ? "bg-source" : "bg-accent")} aria-hidden />
                  <ItemCard onSelect={() => select(row.itemId)} label={row.label} referenced={row.links.length > 0}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone="accent">{row.kindLabel}</Chip>
                      <span className="tabular font-semibold">{row.when}</span>
                      {row.iso ? null : <span className="text-[11px] text-muted-foreground">مهلة نسبية</span>}
                    </div>
                    <p className="mt-1 text-sm leading-6">{row.label}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ClauseTag clause={row.clause} />
                      <SourceChips links={row.links} />
                    </div>
                  </ItemCard>
                </li>
              ))}
            </ol>
          )
        ) : null}

        {view === "financial" ? (
          <div className="space-y-5">
            {model.payments.length === 0 ? (
              <Empty title="لم تُستخرج شروط مالية" description="لا تتوفر معلومات كافية في المستندات المرفوعة." />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {model.payments.map((row) => (
                  <li key={row.id}>
                    <ItemCard onSelect={() => select(row.id)} label={row.description} referenced={row.referenced} className="h-full">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn("tabular text-xl font-semibold", !row.amountVerified && "text-base text-verify")}>
                          {row.amount} {row.amountVerified && row.currency ? <span className="text-sm font-normal text-muted-foreground">{row.currency}</span> : null}
                        </p>
                        <MarkBadge mark={reviewMarks[row.id]} />
                      </div>
                      <p className="mt-1 text-sm leading-6">{row.description}</p>
                      <p className="mt-1 text-xs text-muted-foreground">الاستحقاق: {row.due}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <ClauseTag clause={row.clause} />
                        <SourceChips links={row.links} />
                      </div>
                    </ItemCard>
                  </li>
                ))}
              </ul>
            )}
            {(() => {
              const liability = model.terms.find((t) => t.key === "liability");
              return liability ? (
                <ItemCard onSelect={() => select(liability.id)} label={liability.label} referenced={liability.referenced || liability.status === "not_stated"}>
                  <p className="text-xs font-semibold text-muted-foreground">المسؤولية وحدودها</p>
                  <p className="mt-1 text-sm leading-6">{liability.value}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ClauseTag clause={liability.clause} />
                    <SourceChips links={liability.links} />
                  </div>
                </ItemCard>
              ) : null;
            })()}
          </div>
        ) : null}

        {view === "review" ? (
          model.review.length === 0 ? (
            <Empty title="لم تُحدَّد بنود للمراجعة" description="هذا لا يغني عن مراجعة العقد كاملًا." />
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                الأوصاف هنا ملاحظات مهنية غير قاطعة؛ لا تصف الأداة أي بند بأنه غير نظامي أو عالي الخطورة دون مصدر معرفة قانونية مهيأ.
              </p>
              {model.review.map((row) => (
                <ItemCard key={row.id} onSelect={() => select(row.id)} label={row.topic} referenced={row.referenced}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="accent">{row.label}</Chip>
                    <span className="font-semibold">{row.topic}</span>
                    <ClauseTag clause={row.clause} />
                    <MarkBadge mark={reviewMarks[row.id]} />
                  </div>
                  <Interpretation className="mt-2">
                    {row.note}
                    {row.noteReplaced ? <span className="mt-1 block text-[11px] text-verify">استُبدل وصف قاطع وارد في التحليل الآلي.</span> : null}
                  </Interpretation>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ProvenanceTag referenced={row.referenced} />
                    <SourceChips links={row.links} />
                  </div>
                </ItemCard>
              ))}
            </div>
          )
        ) : null}

        {view === "missing" ? (
          model.missing.length === 0 ? (
            <Empty title="لم تُحدَّد معلومات ناقصة" description="تحقق من ذلك أثناء المراجعة." />
          ) : (
            <ul className="space-y-2">
              {model.missing.map((row) => (
                <li key={row.id}>
                  <ItemCard onSelect={() => select(row.id)} label={row.text} referenced={row.links.length > 0} className="border-s-[3px] border-s-missing bg-missing-soft/40">
                    <span className="text-xs font-semibold text-missing">{row.kindLabel}</span>
                    <p className="mt-1 text-sm leading-7">{row.text}</p>
                    <SourceChips links={row.links} />
                  </ItemCard>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Tabs>

      <SourceSheet
        item={selected ? { kindLabel: selected.kindLabel, title: selected.title, detail: selected.detail, interpretation: selected.interpretation, referenced: selected.referenced, meta: selected.meta } : null}
        links={selected?.links ?? []}
        linksEnabled={!isSample}
        onClose={() => {
          setSelectedId(null);
          sync(view, null);
        }}
        footer={selected && outputId ? <ReviewMarkEditor key={selected.id} outputId={outputId} itemId={selected.id} mark={reviewMarks[selected.id]} /> : null}
      />
    </div>
  );
}
