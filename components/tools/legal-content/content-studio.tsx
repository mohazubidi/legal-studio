"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Copy, Download, Plus, Printer, Save, Trash2, Undo2 } from "lucide-react";
import { saveLegalContentEditsAction } from "@/app/(workspace)/tools/legal-content/actions";
import { ActionMessage } from "@/components/tools/shared/action-message";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { BlockKind, LegalContent } from "@/lib/tools/legal-content/content";
import { applyContentEdits, editsFromContent, type ContentEdits } from "@/lib/tools/legal-content/edits";
import { FORMAT_SPECS, roleSpec } from "@/lib/tools/legal-content/formats";
import { buildContentView, contentToText } from "@/lib/tools/legal-content/view";
import { cn } from "@/lib/utils";
import type { OutputStatus, SourceReferenceRow } from "@/types/database";
import { ContentCards } from "./content-card";

type Reference = Pick<SourceReferenceRow, "id" | "document_id" | "page_or_section" | "source_text">;

const KIND_META: Record<BlockKind, { label: string; className: string }> = {
  source_quote: { label: "نص المصدر (حرفي)", className: "border-accent/50 bg-accent-soft text-foreground" },
  explanation: { label: "شرح كتبه الذكاء الاصطناعي", className: "border-analysis/30 bg-analysis-soft text-analysis" },
  lawyer: { label: "نص المحامي", className: "border-source/30 bg-source-soft text-source" },
};

function Counter({ value, max }: { value: number; max: number }) {
  return <span className={cn("tabular text-xs", value > max ? "font-semibold text-danger" : "text-muted-foreground")}>{value}/{max}</span>;
}

interface StudioProps {
  outputId: string;
  content: LegalContent;
  references: Reference[];
  status: OutputStatus;
}

/** Edit the text of a fixed template, with a live preview in the content design system. */
export function ContentStudio({ outputId, content, references, status }: StudioProps) {
  const [edits, setEdits] = useState<ContentEdits>(() => editsFromContent(content));
  // Start again from the stored content whenever the server version changes (after a save).
  const version = `${content.last_edited_at ?? content.generated_at}|${status}`;
  const [synced, setSynced] = useState(version);
  if (version !== synced) {
    setSynced(version);
    setEdits(editsFromContent(content));
  }

  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const spec = FORMAT_SPECS[content.format];
  const saved = useMemo(() => editsFromContent(content), [content]);
  const dirty = JSON.stringify(saved) !== JSON.stringify(edits);

  // The same rules as the server, applied locally for the live preview.
  const applied = useMemo(() => applyContentEdits(content, edits, references, content.last_edited_at ?? content.generated_at, () => crypto.randomUUID()), [content, edits, references]);
  const previewContent = applied.ok ? applied.content : content;
  const view = useMemo(() => buildContentView(previewContent, references), [previewContent, references]);
  const savedView = useMemo(() => buildContentView(content, references), [content, references]);
  const kindOf = useMemo(() => new Map(previewContent.cards.flatMap((c) => c.blocks.map((b) => [b.id, b] as const))), [previewContent]);
  const originalKind = useMemo(() => new Map(content.cards.flatMap((c) => c.blocks.map((b) => [b.id, b.kind] as const))), [content]);

  // Fixed cards must hold their text: measure overflow after each render.
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const measure = useCallback((cardId: string, node: HTMLDivElement | null) => {
    if (node) nodes.current.set(cardId, node);
    else nodes.current.delete(cardId);
  }, []);
  const [overflow, setOverflow] = useState<string[]>([]);
  useEffect(() => {
    const check = () => {
      const over = [...nodes.current.entries()].filter(([, n]) => n.scrollHeight > n.clientHeight + 2).map(([id]) => id);
      setOverflow((prev) => (prev.join() === over.join() ? prev : over));
    };
    check();
    const observer = new ResizeObserver(check);
    nodes.current.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [view]);
  const overflowLabels = overflow.map((id) => (id === "single" ? "البطاقة" : (view.cards.find((c) => c.id === id)?.kicker ?? "")));

  const setCard = (index: number, change: Partial<ContentEdits["cards"][number]>) =>
    setEdits((e) => ({ ...e, cards: e.cards.map((c, i) => (i === index ? { ...c, ...change } : c)) }));

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await saveLegalContentEditsAction(outputId, edits);
      setMessage(result.ok ? { text: "حُفظت التعديلات. أي تعديل بعد المراجعة يعيد المحتوى إلى مسودة.", tone: "success" } : { text: result.message, tone: "error" });
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(contentToText(savedView));
      setMessage({ text: "نُسخ النص المحفوظ.", tone: "success" });
    } catch {
      setMessage({ text: "تعذّر النسخ إلى الحافظة في هذا المتصفح. استخدم تنزيل الملف النصي.", tone: "error" });
    }
  }

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-label="تحرير النص" className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <label htmlFor="lc-title" className="text-sm font-medium">
                  العنوان
                </label>
                <Counter value={edits.title.trim().length} max={spec.maxTitle} />
              </div>
              <Input id="lc-title" value={edits.title} onChange={(e) => setEdits((s) => ({ ...s, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lc-firm" className="text-sm font-medium">
                اسم المكتب
              </label>
              <Input id="lc-firm" value={edits.firm_name} maxLength={80} onChange={(e) => setEdits((s) => ({ ...s, firm_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="lc-source" className="text-sm font-medium">
                حقل المصدر (يظهر على كل بطاقة)
              </label>
              <Input id="lc-source" value={edits.attribution} maxLength={400} onChange={(e) => setEdits((s) => ({ ...s, attribution: e.target.value }))} />
            </div>
          </div>
        </div>

        {edits.cards.map((card, index) => {
          const original = content.cards.find((c) => c.id === card.id);
          const def = original ? roleSpec(content.format, original.role) : undefined;
          if (!def) return null;
          const bodyLength = card.blocks.reduce((n, b) => n + b.text.trim().length, 0);
          return (
            <div key={card.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-accent">
                  {spec.layout === "slides" ? `الشريحة ${index + 1} · ` : ""}
                  {def.label}
                </p>
                {original?.missing ? <span className="text-xs font-semibold text-missing">لم يُولَّد محتوى — أكمله يدويًا</span> : null}
              </div>
              <p className="mb-3 text-xs text-muted-foreground">{def.guidance}</p>
              <div className="mb-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`h-${card.id}`} className="text-sm font-medium">
                    {content.format === "faq" ? "السؤال" : "العنوان الفرعي"}
                  </label>
                  <Counter value={card.heading.trim().length} max={def.maxHeading} />
                </div>
                <Input id={`h-${card.id}`} value={card.heading} onChange={(e) => setCard(index, { heading: e.target.value })} />
              </div>
              <div className="space-y-3">
                {card.blocks.map((block, bi) => {
                  const current = block.id ? kindOf.get(block.id) : undefined;
                  const kind: BlockKind = current?.kind ?? (block.id ? (originalKind.get(block.id) ?? "lawyer") : "lawyer");
                  const meta = KIND_META[kind];
                  const wasQuote = block.id && originalKind.get(block.id) === "source_quote" && kind !== "source_quote";
                  return (
                    <div key={block.id ?? `new-${bi}`} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("rounded-sm border px-1.5 py-0.5 text-[11px] font-medium", meta.className)}>{meta.label}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="حذف الفقرة"
                          onClick={() => setCard(index, { blocks: card.blocks.filter((_, i) => i !== bi) })}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                      <Textarea
                        aria-label={`${def.label} — فقرة ${bi + 1}`}
                        rows={3}
                        value={block.text}
                        onChange={(e) => setCard(index, { blocks: card.blocks.map((b, i) => (i === bi ? { ...b, text: e.target.value } : b)) })}
                        className={kind === "source_quote" ? "font-serif" : undefined}
                      />
                      {wasQuote ? <p className="text-xs text-verify">عُدّل الاقتباس فلم يعد مطابقًا لنص المصدر؛ سيُعرض كنص للمحامي دون إحالة.</p> : null}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={card.blocks.length >= def.maxBlocks}
                  onClick={() => setCard(index, { blocks: [...card.blocks, { id: null, text: "" }] })}
                >
                  <Plus aria-hidden />
                  إضافة فقرة
                </Button>
                <span className="text-xs text-muted-foreground">
                  النص <Counter value={bodyLength} max={def.maxBody} />
                </span>
              </div>
            </div>
          );
        })}

        <div className="sticky bottom-0 z-10 space-y-2 rounded-lg border border-border bg-surface p-3 shadow-sm">
          {!applied.ok ? <p className="text-sm text-danger">{applied.message}</p> : null}
          <ActionMessage message={message?.text ?? null} tone={message?.tone ?? "success"} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={pending || !dirty || !applied.ok} aria-busy={pending || undefined}>
              <Save aria-hidden />
              {pending ? "جارٍ الحفظ…" : "حفظ التعديلات"}
            </Button>
            <Button variant="ghost" disabled={pending || !dirty} onClick={() => setEdits(saved)}>
              <Undo2 aria-hidden />
              تراجع عن التعديلات
            </Button>
            {dirty ? <span className="self-center text-xs text-verify">تعديلات غير محفوظة</span> : null}
          </div>
        </div>
      </section>

      <section aria-label="المعاينة والتصدير" className="min-w-0 space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="font-semibold">التصدير</h2>
          <p className="mb-3 mt-1 text-xs leading-5 text-muted-foreground">
            يُصدَّر المحتوى المحفوظ بمقاس {view.canvas.sizeLabel}. صفحة الطباعة تعرض كل بطاقة في صفحة مستقلة بمقاسها؛ اختر «حفظ بصيغة PDF» من نافذة الطباعة في المتصفح.
            {status !== "approved" ? " تحمل البطاقات علامة «مسودة» حتى يُعتمد المحتوى." : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {dirty ? (
              <Button variant="secondary" disabled title="احفظ التعديلات أولًا">
                <Printer aria-hidden />
                صفحة الطباعة / PDF
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link href={`/print/legal-content/${outputId}`} target="_blank" rel="noopener">
                  <Printer aria-hidden />
                  صفحة الطباعة / PDF
                </Link>
              </Button>
            )}
            {dirty ? (
              <Button variant="secondary" disabled>
                <Download aria-hidden />
                تنزيل النص (.txt)
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <a href={`/api/legal-content/${outputId}/text`} download>
                  <Download aria-hidden />
                  تنزيل النص (.txt)
                </a>
              </Button>
            )}
            <Button variant="ghost" onClick={copy} disabled={dirty}>
              <Copy aria-hidden />
              نسخ النص
            </Button>
          </div>
          {dirty ? <p className="mt-2 text-xs text-verify">احفظ التعديلات أولًا؛ التصدير يستخدم النسخة المحفوظة.</p> : null}
        </div>

        {overflow.length > 0 ? (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            النص يتجاوز مساحة: {overflowLabels.join("، ")}. اختصره حتى يتسع في القالب.
          </p>
        ) : null}

        <div className={cn("grid gap-4", spec.layout === "slides" ? "sm:grid-cols-2" : "")} data-testid="content-preview">
          <ContentCards view={view} approved={status === "approved" && !dirty} measure={measure} />
        </div>
        <p className="text-xs text-muted-foreground">
          في المعاينة: الاقتباس بين «» مع موضعه من المصدر هو نص المصدر حرفيًا، وما عداه شرح. التمييز بين شرح الذكاء الاصطناعي ونص المحامي يظهر في التحرير.
        </p>
      </section>
    </div>
  );
}
