"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, Bot, Check, ClipboardCheck, FileText, Pencil, Plus, Save, Scale, Trash2, X } from "lucide-react";
import { saveRegDeltaEditsAction } from "@/app/(workspace)/tools/regdelta/actions";
import { EmptyState } from "@/components/legal/empty-state";
import { ActionMessage } from "@/components/tools/shared/action-message";
import { Interpretation } from "@/components/tools/shared/parts";
import { SourceSheet } from "@/components/tools/shared/source-sheet";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { wordDiff, type DiffPart } from "@/lib/tools/regdelta/compare";
import { AI_TYPE_LABELS, CONFIDENCE_LABELS, DETECTED_TYPE_LABELS, type RegDeltaChange, type RegDeltaContent } from "@/lib/tools/regdelta/content";
import type { RegDeltaEdits } from "@/lib/tools/regdelta/edits";
import { AI_CHANGE_TYPES, type AiChangeType } from "@/lib/tools/regdelta/model-schema";
import { changeTypeBadges, filterChanges, filterCounts, getChangeSources, numberRegDeltaReferences, type ChangeFilter } from "@/lib/tools/regdelta/view";
import { cn } from "@/lib/utils";
import type { SourceReferenceRow } from "@/types/database";

const FILTERS: { key: ChangeFilter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "added", label: DETECTED_TYPE_LABELS.added },
  { key: "removed", label: DETECTED_TYPE_LABELS.removed },
  { key: "modified", label: DETECTED_TYPE_LABELS.modified },
  { key: "renumbered", label: DETECTED_TYPE_LABELS.renumbered },
  { key: "deadline", label: DETECTED_TYPE_LABELS.deadline },
  { key: "amount", label: DETECTED_TYPE_LABELS.amount },
  { key: "definition", label: DETECTED_TYPE_LABELS.definition },
  { key: "responsibility", label: AI_TYPE_LABELS.responsibility },
  { key: "procedural", label: AI_TYPE_LABELS.procedural },
  { key: "uncertain", label: "مطابقة غير مؤكدة" },
];

const COLLAPSE_AT = 700;

function DiffText({ parts, fallback }: { parts: DiffPart[] | null; fallback: string }) {
  if (!parts) return <>{fallback}</>;
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "same" ? (
          <span key={i}>{part.text}</span>
        ) : part.kind === "removed" ? (
          <del key={i} className="rounded-sm bg-danger-soft text-danger decoration-danger/60">
            {part.text}
          </del>
        ) : (
          <ins key={i} className="rounded-sm bg-success-soft text-success no-underline">
            {part.text}
          </ins>
        ),
      )}
    </>
  );
}

function VersionColumn({
  side,
  label,
  location,
  text,
  parts,
  onOpenSource,
}: {
  side: "previous" | "next";
  label: string | null;
  location: string | null;
  text: string | null;
  parts: DiffPart[] | null;
  onOpenSource: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const title = side === "previous" ? "النسخة السابقة (أ)" : "النسخة الجديدة (ب)";
  if (!text) {
    return (
      <div className="rounded-md border border-dashed border-border bg-surface-muted/40 p-3">
        <p className="mb-1 text-xs font-semibold text-muted-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{side === "previous" ? "لا يوجد مقابل في النسخة السابقة." : "لا يوجد مقابل في النسخة الجديدة."}</p>
      </div>
    );
  }
  const long = text.length > COLLAPSE_AT;
  return (
    <div className={cn("rounded-md border p-3", side === "previous" ? "border-danger/20 bg-surface" : "border-success/20 bg-surface")}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{title}</p>
        <button
          type="button"
          onClick={onOpenSource}
          className="inline-flex h-6 items-center gap-1 rounded-sm border border-source/30 bg-source-soft px-2 text-[11px] font-medium text-source hover:border-source"
          aria-label={`عرض موضع ${label} في ${title}`}
        >
          <FileText className="size-3" aria-hidden />
          {label} · {location}
        </button>
      </div>
      <p className={cn("whitespace-pre-wrap font-serif text-[15px] leading-8", long && !expanded && "line-clamp-[8]")}>
        <DiffText parts={parts} fallback={text} />
      </p>
      {long ? (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 text-xs font-medium text-primary hover:underline">
          {expanded ? "عرض أقل" : "عرض النص كاملًا"}
        </button>
      ) : null}
    </div>
  );
}

interface Draft {
  changes: Record<string, { summary: string; significance: string; ai_types: AiChangeType[]; excluded: boolean }>;
  impacts: RegDeltaEdits["impacts"];
  checklist: RegDeltaEdits["checklist"];
}

function draftFrom(content: RegDeltaContent): Draft {
  return {
    changes: Object.fromEntries(content.changes.map((c) => [c.id, { summary: c.summary, significance: c.significance, ai_types: [...c.ai_types], excluded: c.excluded }])),
    impacts: content.impacts.map((i) => ({ id: i.id, area: i.area, description: i.description, change_ids: [...i.change_ids] })),
    checklist: content.checklist.map((c) => ({ id: c.id, item: c.item, change_ids: [...c.change_ids] })),
  };
}

interface RegDeltaViewProps {
  outputId: string | null;
  content: RegDeltaContent;
  references: SourceReferenceRow[];
  initialChange?: string | null;
  initialSide?: "previous" | "next" | null;
  isSample?: boolean;
}

export function RegDeltaView({ outputId, content, references, initialChange = null, initialSide = null, isSample = false }: RegDeltaViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = useState<ChangeFilter>("all");
  const [showExcluded, setShowExcluded] = useState(false);
  const [open, setOpen] = useState<{ change: string; side: "previous" | "next" } | null>(initialChange && initialSide ? { change: initialChange, side: initialSide } : null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(content));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);

  const numbers = useMemo(() => numberRegDeltaReferences(content), [content]);
  const counts = useMemo(() => filterCounts(content.changes), [content]);
  const visible = filterChanges(content.changes, filter, showExcluded || editing);
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(draftFrom(content));
  const canEdit = Boolean(outputId) && !isSample;

  const sync = useCallback(
    (next: { change: string; side: "previous" | "next" } | null) => {
      if (!outputId) return;
      const params = new URLSearchParams(next ? { change: next.change, side: next.side } : {});
      router.replace(`${pathname}${next ? `?${params.toString()}` : ""}`, { scroll: false });
    },
    [outputId, pathname, router],
  );
  const openSource = (change: string, side: "previous" | "next") => {
    setOpen({ change, side });
    sync({ change, side });
  };

  const selected = open ? content.changes.find((c) => c.id === open.change) : undefined;
  const selectedSide = selected && open ? selected[open.side] : null;
  const selectedLink = selected && open ? getChangeSources(selected, references, content, numbers)[open.side] : null;

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveRegDeltaEditsAction(outputId!, {
        changes: Object.entries(draft.changes).map(([id, c]) => ({ id, ...c })),
        impacts: draft.impacts.filter((i) => i.description.trim()),
        checklist: draft.checklist.filter((c) => c.item.trim()),
      });
      if (!result.ok) {
        setMessage({ text: result.message, tone: "error" });
        return;
      }
      setEditing(false);
      setMessage({ text: "حُفظت التعديلات. أعيدت المقارنة إلى حالة المسودة إن كانت قيد المراجعة.", tone: "success" });
    });
  }

  const setChange = (id: string, patch: Partial<Draft["changes"][string]>) => setDraft((d) => ({ ...d, changes: { ...d.changes, [id]: { ...d.changes[id], ...patch } } }));
  const scrollTo = (id: string) => document.getElementById(`change-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="space-y-6">
      <div role="note" className="flex items-start gap-3 rounded-md border border-verify/30 bg-verify-soft px-4 py-3 text-sm leading-6 text-verify">
        <Scale className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          المقارنة مبنية على النسختين المرفوعتين فقط، دون بحث في أي مصدر خارجي. <span className="font-semibold">لم يُتحقق من نفاذ أي من النسختين</span>، ولا تعني المقارنة أن النسخة
          الجديدة سارية. النصوص السابقة والجديدة منقولة حرفيًا من المستندين؛ الشروح والأثر والقائمة تحليل آلي يتطلب تحققًا.
        </p>
      </div>

      {isSample ? (
        <p role="note" className="rounded-md border border-accent/40 bg-accent-soft px-4 py-2 text-sm">
          <span className="font-semibold">مثال توضيحي بنسختين خياليتين.</span> المطابقة والتصنيف حُسبا بالخوارزمية الفعلية، وحُذفت عبارة في التحليل الآلي تفترض نفاذ النسخة الجديدة.
        </p>
      ) : null}

      {content.warnings.length > 0 ? (
        <div role="status" className="rounded-md border border-border bg-surface px-4 py-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4 text-verify" aria-hidden />
            ملاحظات المقارنة
          </p>
          <ul className="list-disc space-y-0.5 ps-5 text-muted-foreground">
            {content.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["مواد النسخة السابقة", content.documents.previous.provision_count],
          ["مواد النسخة الجديدة", content.documents.next.provision_count],
          ["تغييرات", counts.all],
          ["دون تغيير", content.unchanged.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-surface px-3 py-2">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="tabular text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="changes-h" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="changes-h" className="text-lg font-semibold">
            التغييرات
          </h2>
          {canEdit ? (
            editing ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={pending || !dirty} aria-busy={pending || undefined}>
                  <Save aria-hidden />
                  {pending ? "جارٍ الحفظ…" : "حفظ التعديلات"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setDraft(draftFrom(content));
                    setEditing(false);
                  }}
                >
                  <X aria-hidden />
                  إلغاء
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                مراجعة وتحرير المقارنة
              </Button>
            )
          ) : null}
        </div>
        {editing ? (
          <p role="status" className="rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-xs leading-5">
            تُحرَّر الشروح وأنواع التغيير المقترحة آليًا والأثر والقائمة فقط. النصوص المنقولة من المستندين ومواضعها والأنواع المرصودة من النص ثابتة.
            {dirty ? " لديك تعديلات غير محفوظة." : ""}
          </p>
        ) : null}
        <ActionMessage message={message?.text ?? null} tone={message?.tone ?? "success"} />

        <div role="group" aria-label="تصفية التغييرات" className="flex flex-wrap gap-2">
          {FILTERS.filter((f) => f.key === "all" || (counts[f.key] ?? 0) > 0).map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "tabular inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs",
                filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface hover:bg-surface-muted",
              )}
            >
              {f.label} <span className="opacity-75">{counts[f.key] ?? 0}</span>
            </button>
          ))}
          {!editing && content.changes.some((c) => c.excluded) ? (
            <label className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={showExcluded} onChange={(e) => setShowExcluded(e.target.checked)} className="accent-primary" />
              إظهار المستبعدة
            </label>
          ) : null}
        </div>

        {visible.length === 0 ? (
          <EmptyState title="لا توجد تغييرات بهذا التصنيف" className="rounded-md border border-dashed border-border" />
        ) : (
          <ol className="space-y-5">
            {visible.map((change) => (
              <ChangeCard
                key={change.id}
                change={change}
                editing={editing}
                draft={draft.changes[change.id]}
                onDraft={(patch) => setChange(change.id, patch)}
                onOpenSource={(side) => openSource(change.id, side)}
              />
            ))}
          </ol>
        )}

        {content.unchanged.length > 0 ? (
          <details className="rounded-md border border-border bg-surface px-4 py-2 text-sm">
            <summary className="cursor-pointer text-muted-foreground">مواد دون تغيير في النص ({content.unchanged.length})</summary>
            <ul className="mt-2 list-disc space-y-0.5 ps-5 text-muted-foreground">
              {content.unchanged.map((u) => (
                <li key={`${u.previous}-${u.next}`}>{u.previous === u.next ? u.next : `${u.previous} ← ${u.next}`}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="impact-h" className="rounded-lg border-2 border-analysis/40 bg-analysis-soft/40 p-5">
        <h2 id="impact-h" className="flex items-center gap-2 text-lg font-semibold text-analysis">
          <Bot className="size-5" aria-hidden />
          الأثر التشغيلي المحتمل
        </h2>
        <p className="mb-4 mt-1 text-sm font-medium text-analysis">تحليل بالذكاء الاصطناعي يتطلب تحققًا مهنيًا. ليس رأيًا قانونيًا ولا يفترض نفاذ النسخة الجديدة.</p>
        <EditableList
          editing={editing}
          items={editing ? draft.impacts : content.impacts}
          empty="لم يُقترح أثر تشغيلي."
          render={(item) => (
            <>
              {item.area ? <p className="text-xs font-semibold text-analysis">{item.area}</p> : null}
              <p className="text-sm leading-7">{item.description}</p>
            </>
          )}
          renderEdit={(item, update) => (
            <div className="space-y-2">
              <Input aria-label="المجال" value={item.area} placeholder="المجال" onChange={(e) => update({ ...item, area: e.target.value })} />
              <Textarea aria-label="وصف الأثر" rows={2} value={item.description} onChange={(e) => update({ ...item, description: e.target.value })} />
            </div>
          )}
          onChange={(impacts) => setDraft((d) => ({ ...d, impacts: impacts as Draft["impacts"] }))}
          blank={{ area: "", description: "", change_ids: [] }}
          addLabel="إضافة أثر"
          onJump={scrollTo}
        />
      </section>

      <section aria-labelledby="checklist-h" className="rounded-lg border border-border bg-surface p-5">
        <h2 id="checklist-h" className="flex items-center gap-2 text-lg font-semibold">
          <ClipboardCheck className="size-5 text-accent" aria-hidden />
          قائمة امتثال أولية
        </h2>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">مبنية على النسختين المرفوعتين فقط، ومولّدة بالذكاء الاصطناعي. تحقق من كل بند قبل الاعتماد عليه.</p>
        <EditableList
          editing={editing}
          items={editing ? draft.checklist : content.checklist}
          empty="لم تُقترح بنود."
          render={(item) => <p className="text-sm leading-7">{item.item}</p>}
          renderEdit={(item, update) => <Textarea aria-label="بند القائمة" rows={2} value={item.item} onChange={(e) => update({ ...item, item: e.target.value })} />}
          onChange={(checklist) => setDraft((d) => ({ ...d, checklist: checklist as Draft["checklist"] }))}
          blank={{ item: "", change_ids: [] }}
          addLabel="إضافة بند"
          onJump={scrollTo}
          checklist
        />
      </section>

      <SourceSheet
        item={
          selected && selectedSide && open
            ? {
                kindLabel: open.side === "previous" ? "النسخة السابقة (أ)" : "النسخة الجديدة (ب)",
                title: `${selectedSide.label} · ${selectedSide.location}`,
                detail: null,
                interpretation: null,
                referenced: selectedLink !== null,
                meta: [
                  { label: "المستند", value: (open.side === "previous" ? content.documents.previous : content.documents.next).file_name },
                  { label: "التغيير", value: selected.id },
                ],
              }
            : null
        }
        links={selectedLink ? [selectedLink] : []}
        linksEnabled={!isSample}
        onClose={() => {
          setOpen(null);
          sync(null);
        }}
      />
    </div>
  );
}

function ChangeCard({
  change,
  editing,
  draft,
  onDraft,
  onOpenSource,
}: {
  change: RegDeltaChange;
  editing: boolean;
  draft: Draft["changes"][string];
  onDraft: (patch: Partial<Draft["changes"][string]>) => void;
  onOpenSource: (side: "previous" | "next") => void;
}) {
  const diff = useMemo(
    () => (change.previous && change.next && change.detected_types.includes("modified") ? wordDiff(change.previous.text, change.next.text) : null),
    [change],
  );
  const badges = changeTypeBadges(editing ? { detected_types: change.detected_types, ai_types: draft.ai_types } : change);
  const excluded = editing ? draft.excluded : change.excluded;

  return (
    <li id={`change-${change.id}`} className={cn("scroll-mt-24 rounded-lg border border-border bg-surface", excluded && "opacity-60")}>
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className="tabular rounded-sm bg-surface-muted px-1.5 text-xs font-semibold">{change.id}</span>
        {badges.map((badge) =>
          badge.origin === "detected" ? (
            <span key={badge.key} className="inline-flex h-6 items-center rounded-full border border-primary/30 bg-primary/5 px-2.5 text-xs font-medium" title="مرصود آليًا من النص">
              {badge.label}
            </span>
          ) : (
            <span key={badge.key} className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-analysis/50 bg-analysis-soft px-2.5 text-xs text-analysis" title="تصنيف مقترح بالذكاء الاصطناعي">
              <Bot className="size-3" aria-hidden />
              {badge.label}
            </span>
          ),
        )}
        {change.match ? <span className="text-[11px] text-muted-foreground">{CONFIDENCE_LABELS[change.match.confidence]} ({Math.round(change.match.similarity * 100)}%)</span> : null}
        {change.edited ? <span className="text-[11px] text-accent">عُدّل بواسطة المراجع</span> : null}
        {excluded ? <span className="text-[11px] text-muted-foreground">مستبعد من المقارنة</span> : null}
      </header>

      <div className="grid gap-3 p-4 md:grid-cols-2">
        <VersionColumn side="previous" label={change.previous?.label ?? null} location={change.previous?.location ?? null} text={change.previous?.text ?? null} parts={diff?.previous ?? null} onOpenSource={() => onOpenSource("previous")} />
        <VersionColumn side="next" label={change.next?.label ?? null} location={change.next?.location ?? null} text={change.next?.text ?? null} parts={diff?.next ?? null} onOpenSource={() => onOpenSource("next")} />
      </div>

      <div className="space-y-3 px-4 pb-4">
        {change.uncertainty ? (
          <p role="note" className="flex items-start gap-2 rounded-md border border-verify/30 bg-verify-soft px-3 py-2 text-sm leading-6 text-verify">
            <AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">ملاحظة المطابقة (من المقارنة الآلية): </span>
              {change.uncertainty}
            </span>
          </p>
        ) : null}

        {editing ? (
          <div className="space-y-3 rounded-md border border-analysis/30 bg-analysis-soft/40 p-3">
            <label className="block space-y-1 text-xs font-medium">
              ملخص التغيير
              <Textarea rows={2} value={draft.summary} onChange={(e) => onDraft({ summary: e.target.value })} />
            </label>
            <label className="block space-y-1 text-xs font-medium">
              الدلالة الظاهرة
              <Textarea rows={3} value={draft.significance} onChange={(e) => onDraft({ significance: e.target.value })} />
            </label>
            <fieldset>
              <legend className="mb-1 text-xs font-medium">الأنواع المقترحة بالذكاء الاصطناعي</legend>
              <div className="flex flex-wrap gap-2">
                {AI_CHANGE_TYPES.map((type) => (
                  <label key={type} className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-xs">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={draft.ai_types.includes(type)}
                      onChange={(e) => onDraft({ ai_types: e.target.checked ? [...draft.ai_types, type] : draft.ai_types.filter((t) => t !== type) })}
                    />
                    {AI_TYPE_LABELS[type]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="accent-primary" checked={draft.excluded} onChange={(e) => onDraft({ excluded: e.target.checked })} />
              استبعاد هذا التغيير (مثلًا: فرق شكلي أو مطابقة غير صحيحة)
            </label>
          </div>
        ) : (
          <Interpretation>
            {change.summary ? <p className="font-medium">{change.summary}</p> : null}
            <p className="mt-1">{change.significance}</p>
            {change.match_assessment ? <p className="mt-2 text-xs text-muted-foreground">تقييم المطابقة: {change.match_assessment}</p> : null}
          </Interpretation>
        )}
      </div>
    </li>
  );
}

type ListItem = { id?: string; change_ids: string[] } & Record<string, unknown>;

function EditableList<T extends ListItem>({
  editing,
  items,
  empty,
  render,
  renderEdit,
  onChange,
  blank,
  addLabel,
  onJump,
  checklist = false,
}: {
  editing: boolean;
  items: T[];
  empty: string;
  render: (item: T) => ReactNode;
  renderEdit: (item: T, update: (next: T) => void) => ReactNode;
  onChange: (items: T[]) => void;
  blank: Omit<T, "id">;
  addLabel: string;
  onJump: (changeId: string) => void;
  checklist?: boolean;
}) {
  if (!editing && items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={item.id ?? `new-${index}`} className="flex items-start gap-3 rounded-md border border-border bg-surface p-3">
            {checklist && !editing ? <Check className="mt-1.5 size-4 shrink-0 text-accent" aria-hidden /> : null}
            <div className="min-w-0 flex-1">
              {editing ? renderEdit(item, (next) => onChange(items.map((it, i) => (i === index ? next : it)))) : render(item)}
              {item.change_ids.length > 0 ? (
                <p className="mt-1 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                  مرتبط بـ:
                  {item.change_ids.map((id) => (
                    <button key={id} type="button" onClick={() => onJump(id)} className="tabular rounded-sm bg-surface-muted px-1 font-medium text-primary hover:underline">
                      {id}
                    </button>
                  ))}
                </p>
              ) : null}
            </div>
            {editing ? (
              <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => onChange(items.filter((_, i) => i !== index))}>
                <Trash2 aria-hidden />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {editing ? (
        <Button size="sm" variant="secondary" onClick={() => onChange([...items, { ...blank } as T])}>
          <Plus aria-hidden />
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}
