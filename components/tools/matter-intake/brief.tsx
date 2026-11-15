"use client";

import { FileName } from "@/components/legal/file-name";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, Bot, CheckCircle2, FileText, FolderPlus, MessageSquareQuote, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { finalizeIntakeAction, saveBriefEditsAction } from "@/app/(workspace)/tools/matter-intake/actions";
import { ConfirmDialog } from "@/components/legal/confirm-dialog";
import { ActionMessage } from "@/components/tools/shared/action-message";
import { Chip, Interpretation } from "@/components/tools/shared/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ANSWER_TYPE_LABELS, FIELD_KEYS, FIELD_LABELS, FIELD_STATUSES, NOT_PROVIDED, STATUS_LABELS, type FieldStatus, type IntakeContent } from "@/lib/tools/matter-intake/content";
import { briefEditsSchema, editsFromContent, suggestMatterName, type BriefEdits } from "@/lib/tools/matter-intake/edits";
import { ANSWER_TYPES } from "@/lib/tools/matter-intake/model-schema";
import { numberReferences, resolveSourceLinks, type SourceLink } from "@/lib/tools/shared/source-links";
import { cn } from "@/lib/utils";
import type { SourceReferenceRow } from "@/types/database";

const STATUS_STYLE: Record<FieldStatus, string> = {
  stated: "border-source/30 bg-source-soft text-source",
  inferred: "border-analysis/40 bg-analysis-soft text-analysis border-dashed",
  unclear: "border-missing/30 bg-missing-soft text-missing",
  not_provided: "border-border bg-surface-muted text-muted-foreground",
  confirmed: "border-success/30 bg-success-soft text-success",
};

function StatusTag({ status }: { status: FieldStatus }) {
  return <span className={cn("inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-medium", STATUS_STYLE[status])}>{STATUS_LABELS[status]}</span>;
}

/** The client's own words, shown separately from the AI-organised value. */
function ClientWords({ links, linksEnabled }: { links: SourceLink[]; linksEnabled: boolean }) {
  if (links.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <p className="flex items-center gap-1 text-[11px] font-semibold text-source">
        <MessageSquareQuote className="size-3" aria-hidden />
        كلام العميل كما ورد
      </p>
      {links.map((link) => (
        <figure key={link.referenceId} className="rounded-sm border-s-2 border-source bg-source-soft/50 px-2 py-1">
          <blockquote className="font-serif text-[15px] leading-7">«{link.excerpt}»</blockquote>
          <figcaption className="text-[11px] text-muted-foreground">
            <bdi>{link.documentName}</bdi> · {link.location ?? "موضع غير محدد"}
            {linksEnabled ? (
              <>
                {" · "}
                <a href={link.href} className="text-primary hover:underline">فتح المصدر</a>
              </>
            ) : null}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function Section({ title, description, children, tone }: { title: string; description?: string; children: ReactNode; tone?: "ai" }) {
  return (
    <section className={cn("rounded-lg border bg-surface p-4", tone === "ai" ? "border-analysis/30" : "border-border")}>
      <h3 className="flex items-center gap-2 font-semibold">
        {tone === "ai" ? <Bot className="size-4 text-analysis" aria-hidden /> : null}
        {title}
      </h3>
      {description ? <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{description}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

const None = ({ text = "لا شيء." }: { text?: string }) => <p className="text-sm text-muted-foreground">{text}</p>;

interface BriefProps {
  outputId: string | null;
  content: IntakeContent;
  references: SourceReferenceRow[];
  isSample?: boolean;
}

export function IntakeBrief({ outputId, content, references, isSample = false }: BriefProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BriefEdits>(() => editsFromContent(content));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [matterName, setMatterName] = useState(() => suggestMatterName(content));
  const [matterType, setMatterType] = useState(() => (content.fields.matter_type.status === "not_provided" ? "" : content.fields.matter_type.value));
  const [confirmOpen, setConfirmOpen] = useState(false);

  const numbers = useMemo(
    () => numberReferences([content.summary.reference_ids, ...FIELD_KEYS.map((k) => content.fields[k].reference_ids), ...content.other_parties.map((p) => p.reference_ids), ...content.key_events.map((e) => e.reference_ids)]),
    [content],
  );
  const names = useMemo(() => new Map(content.sources.map((s) => [s.document_id, s.file_name])), [content]);
  const links = (ids: string[]) => resolveSourceLinks(ids, references, names, numbers);
  const canEdit = Boolean(outputId) && !isSample && !content.finalized;
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(editsFromContent(content));

  function save() {
    setMessage(null);
    const parsed = briefEditsSchema.safeParse(draft);
    if (!parsed.success) {
      setMessage({ text: parsed.error.issues[0]?.message ?? "التعديلات غير صالحة.", tone: "error" });
      return;
    }
    startTransition(async () => {
      const result = await saveBriefEditsAction(outputId!, draft);
      if (!result.ok) {
        setMessage({ text: result.message, tone: "error" });
        return;
      }
      setEditing(false);
      setMessage({ text: "حُفظت تعديلاتك على الملخص.", tone: "success" });
      router.refresh();
    });
  }

  async function finalize() {
    setMessage(null);
    const result = await finalizeIntakeAction(outputId!, { matter_name: matterName, matter_type: matterType });
    if (!result.ok) {
      setMessage({ text: result.message, tone: "error" });
      return;
    }
    router.refresh();
  }

  const setField = (key: (typeof FIELD_KEYS)[number], patch: Partial<BriefEdits["fields"]["client"]>) =>
    setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: { ...d.fields[key], ...patch } } }));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <div role="note" className="flex items-start gap-3 rounded-md border border-analysis/30 bg-analysis-soft px-4 py-3 text-sm leading-6">
          <Bot className="mt-0.5 size-4 shrink-0 text-analysis" aria-hidden />
          <p>
            ملخص منظَّم آليًا من مواد العميل، وليس استشارة قانونية. كل حقل يبيّن حالته: ذكره العميل (مع كلامه كما ورد)، أو مستنتج يتطلب تأكيدًا، أو غير واضح، أو لم يُقدَّم. لا يُملأ أي نقص
            تلقائيًا.
          </p>
        </div>

        {isSample ? (
          <p role="note" className="rounded-md border border-accent/40 bg-accent-soft px-4 py-2 text-sm">
            <span className="font-semibold">مثال توضيحي بعميل خيالي.</span> بُني بقواعد التحقق الفعلية: حُذفت نصيحة قانونية من الملخص، ووُسم حقل بلا سند كمستنتج، وحُذف مبلغ لم يذكره العميل.
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

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">ملخص الاستقبال</h2>
          {canEdit ? (
            editing ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={pending || !dirty} aria-busy={pending || undefined}>
                  <Save aria-hidden />
                  {pending ? "جارٍ الحفظ…" : "حفظ التعديلات"}
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setDraft(editsFromContent(content)); setEditing(false); }}>
                  <X aria-hidden />
                  إلغاء
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                تحرير الملخص
              </Button>
            )
          ) : null}
        </div>
        <ActionMessage message={message?.text ?? null} tone={message?.tone ?? "success"} />

        <Section title="الملخص المنظَّم" description="إعادة صياغة منظمة لرواية العميل، كتبها الذكاء الاصطناعي. كلام العميل نفسه معروض تحت كل حقل." tone="ai">
          {editing ? (
            <Textarea aria-label="الملخص" rows={4} value={draft.summary} onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))} />
          ) : (
            <Interpretation>{content.summary.text || NOT_PROVIDED}</Interpretation>
          )}
        </Section>

        <Section title="البيانات الأساسية">
          <dl className="grid gap-4 md:grid-cols-2">
            {FIELD_KEYS.map((key) => {
              const field = content.fields[key];
              return (
                <div key={key} className="rounded-md border border-border p-3">
                  <dt className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                    {FIELD_LABELS[key]}
                    {!editing ? <StatusTag status={field.status} /> : null}
                  </dt>
                  {editing ? (
                    <dd className="space-y-2">
                      <Input aria-label={FIELD_LABELS[key]} value={draft.fields[key].value} onChange={(e) => setField(key, { value: e.target.value, status: e.target.value ? (draft.fields[key].status === "not_provided" ? "confirmed" : draft.fields[key].status) : "not_provided" })} />
                      <select
                        aria-label={`حالة ${FIELD_LABELS[key]}`}
                        value={draft.fields[key].status}
                        onChange={(e) => setField(key, { status: e.target.value as FieldStatus })}
                        className="block h-8 w-full rounded-md border border-border-strong bg-surface px-2 text-xs"
                      >
                        {FIELD_STATUSES.map((s) => (
                          <option key={s} value={s} disabled={(s === "not_provided") !== !draft.fields[key].value}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </dd>
                  ) : (
                    <dd>
                      <p className={cn("text-sm leading-7", field.status === "not_provided" && "text-muted-foreground")}>{field.value || NOT_PROVIDED}</p>
                      {field.note ? <p className="mt-1 text-xs text-verify">{field.note}</p> : null}
                      <ClientWords links={links(field.reference_ids)} linksEnabled={!isSample} />
                    </dd>
                  )}
                </div>
              );
            })}
          </dl>
        </Section>

        <Section title="الأطراف الأخرى">
          {editing ? (
            <ListEditor
              items={draft.other_parties}
              onChange={(other_parties) => setDraft((d) => ({ ...d, other_parties }))}
              blank={{ name: "", role: "", status: "confirmed" as FieldStatus }}
              addLabel="إضافة طرف"
              render={(item, update) => (
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input aria-label="اسم الطرف" placeholder="الاسم" value={item.name} onChange={(e) => update({ ...item, name: e.target.value })} />
                  <Input aria-label="صفة الطرف" placeholder="الصفة" value={item.role} onChange={(e) => update({ ...item, role: e.target.value })} />
                  <select aria-label="الحالة" value={item.status} onChange={(e) => update({ ...item, status: e.target.value as FieldStatus })} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-xs">
                    {FIELD_STATUSES.filter((s) => s !== "not_provided").map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
              )}
            />
          ) : content.other_parties.length === 0 ? (
            <None text={NOT_PROVIDED} />
          ) : (
            <ul className="space-y-3">
              {content.other_parties.map((p) => (
                <li key={p.id} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.role ? <Chip>{p.role}</Chip> : null}
                    <StatusTag status={p.status} />
                  </div>
                  <ClientWords links={links(p.reference_ids)} linksEnabled={!isSample} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {!editing ? (
          <>
            <Section title="الوقائع والتواريخ">
              {content.key_events.length === 0 ? (
                <None text={NOT_PROVIDED} />
              ) : (
                <ol className="space-y-3">
                  {content.key_events.map((e) => (
                    <li key={e.id} className="rounded-md border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tabular min-w-24 text-sm font-semibold">{e.date?.text ?? "دون تاريخ مذكور"}</span>
                        <span className="text-sm">{e.description}</span>
                        <StatusTag status={e.status} />
                      </div>
                      <ClientWords links={links(e.reference_ids)} linksEnabled={!isSample} />
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <Section title="المبالغ">
              {content.amounts.length === 0 ? (
                <None text="لم يذكر العميل مبالغ يمكن التحقق منها." />
              ) : (
                <ul className="space-y-3">
                  {content.amounts.map((a) => (
                    <li key={a.id} className="rounded-md border border-border p-3">
                      <p className="text-sm">
                        <span className="text-muted-foreground">{a.label}: </span>
                        <span className="tabular font-semibold">{a.amount_text}</span> {a.currency}
                      </p>
                      <ClientWords links={links(a.reference_ids)} linksEnabled={!isSample} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="المستندات المستلمة والمذكورة">
              {content.documents_received.length === 0 ? (
                <None />
              ) : (
                <ul className="space-y-2">
                  {content.documents_received.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <FileText className="size-4 text-muted-foreground" aria-hidden />
                      <FileName name={d.description} />
                      <Chip tone={d.origin === "uploaded" ? "accent" : "neutral"}>{d.origin === "uploaded" ? "مرفوع" : "ذكره العميل"}</Chip>
                      {d.provided ? (
                        <span className="text-xs text-success">مستلم</span>
                      ) : (
                        <span className="text-xs text-verify">{d.origin === "uploaded" ? "تعذّرت معالجته" : "لم يُستلم بعد"}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="تعارضات في رواية العميل" tone="ai">
              {content.contradictions.length === 0 ? (
                <None text="لم يُرصد تعارض." />
              ) : (
                content.contradictions.map((c) => (
                  <div key={c.id} className="mb-3 rounded-md border border-verify/30 p-3">
                    <p className="mb-2 font-medium">{c.topic}</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {c.statements.map((s, i) => (
                        <div key={i} className="rounded-md bg-surface-muted/50 p-2 text-sm">
                          {s.text}
                          <ClientWords links={links(s.reference_ids)} linksEnabled={!isSample} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </Section>
          </>
        ) : null}

        <Section title="معلومات ناقصة" tone="ai">
          {editing ? (
            <ListEditor
              items={draft.missing_information}
              onChange={(missing_information) => setDraft((d) => ({ ...d, missing_information }))}
              blank={{ text: "" }}
              addLabel="إضافة"
              render={(item, update) => <Input aria-label="معلومة ناقصة" value={item.text} onChange={(e) => update({ ...item, text: e.target.value })} />}
            />
          ) : content.missing_information.length === 0 ? (
            <None />
          ) : (
            <ul className="list-disc space-y-1 ps-5 text-sm leading-7">{content.missing_information.map((m) => <li key={m.id}>{m.text}</li>)}</ul>
          )}
        </Section>

        <Section title="مستندات ناقصة" tone="ai">
          {editing ? (
            <ListEditor
              items={draft.missing_documents}
              onChange={(missing_documents) => setDraft((d) => ({ ...d, missing_documents }))}
              blank={{ document: "", reason: "" }}
              addLabel="إضافة"
              render={(item, update) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input aria-label="المستند" value={item.document} onChange={(e) => update({ ...item, document: e.target.value })} />
                  <Input aria-label="السبب" value={item.reason} onChange={(e) => update({ ...item, reason: e.target.value })} />
                </div>
              )}
            />
          ) : content.missing_documents.length === 0 ? (
            <None />
          ) : (
            <ul className="space-y-1 text-sm leading-7">
              {content.missing_documents.map((d) => (
                <li key={d.id}>
                  <span className="font-medium">{d.document}</span>
                  {d.reason ? <span className="text-muted-foreground"> — {d.reason}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="أسئلة توضيحية" tone="ai">
          {editing ? (
            <ListEditor
              items={draft.clarification_questions}
              onChange={(clarification_questions) => setDraft((d) => ({ ...d, clarification_questions }))}
              blank={{ question: "", reason: "" }}
              addLabel="إضافة سؤال"
              render={(item, update) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input aria-label="السؤال" value={item.question} onChange={(e) => update({ ...item, question: e.target.value })} />
                  <Input aria-label="السبب" value={item.reason} onChange={(e) => update({ ...item, reason: e.target.value })} />
                </div>
              )}
            />
          ) : content.clarification_questions.length === 0 ? (
            <None />
          ) : (
            <ol className="list-decimal space-y-1 ps-5 text-sm leading-7">
              {content.clarification_questions.map((q) => (
                <li key={q.id}>
                  {q.question}
                  {q.reason ? <span className="block text-xs text-muted-foreground">{q.reason}</span> : null}
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="استبيان المتابعة" description="أسئلة محايدة لاستكمال المعلومات من العميل. لا يتضمن نصائح قانونية." tone="ai">
          {editing ? (
            <ListEditor
              items={draft.questionnaire}
              onChange={(questionnaire) => setDraft((d) => ({ ...d, questionnaire }))}
              blank={{ section: "", questions: [] }}
              addLabel="إضافة قسم"
              render={(section, update) => (
                <div className="space-y-2">
                  <Input aria-label="عنوان القسم" value={section.section} onChange={(e) => update({ ...section, section: e.target.value })} />
                  <ListEditor
                    items={section.questions}
                    onChange={(questions) => update({ ...section, questions })}
                    blank={{ question: "", purpose: "", answer_type: "text" as const }}
                    addLabel="إضافة سؤال"
                    render={(q, updateQ) => (
                      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
                        <Input aria-label="السؤال" value={q.question} onChange={(e) => updateQ({ ...q, question: e.target.value })} />
                        <Input aria-label="الغرض" value={q.purpose} onChange={(e) => updateQ({ ...q, purpose: e.target.value })} />
                        <select aria-label="نوع الإجابة" value={q.answer_type} onChange={(e) => updateQ({ ...q, answer_type: e.target.value as (typeof ANSWER_TYPES)[number] })} className="h-9 rounded-md border border-border-strong bg-surface px-2 text-xs">
                          {ANSWER_TYPES.map((t) => (
                            <option key={t} value={t}>{ANSWER_TYPE_LABELS[t]}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  />
                </div>
              )}
            />
          ) : content.questionnaire.length === 0 ? (
            <None />
          ) : (
            <div className="space-y-4">
              {content.questionnaire.map((s) => (
                <div key={s.id}>
                  <h4 className="mb-2 text-sm font-semibold">{s.section}</h4>
                  <ol className="list-decimal space-y-2 ps-5 text-sm">
                    {s.questions.map((q) => (
                      <li key={q.id}>
                        <span className="leading-7">{q.question}</span>{" "}
                        <Chip>{ANSWER_TYPE_LABELS[q.answer_type]}</Chip>
                        {q.purpose ? <span className="block text-xs text-muted-foreground">{q.purpose}</span> : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div className="space-y-4">
        <Card className="xl:sticky xl:top-24">
          <CardHeader className="block">
            <CardTitle>إنشاء الملف</CardTitle>
            <CardDescription>راجع الملخص وعدّله أولًا. يُنشأ الملف من النسخة المحفوظة.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {content.finalized ? (
              <div role="status" className="space-y-2 rounded-md border border-success/30 bg-success-soft p-3 text-sm text-success">
                <p className="flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="size-4" aria-hidden />
                  أُنشئ الملف.
                </p>
                <p className="text-foreground">يمكنك الآن استخدامه في الأدوات:</p>
                <div className="flex flex-wrap gap-2">
                  <Link className="text-primary underline-offset-4 hover:underline" href={`/tools/legal-memo?matter=${content.finalized.matter_id}`}>المذكرة القانونية</Link>
                  <Link className="text-primary underline-offset-4 hover:underline" href={`/tools/casemap?matter=${content.finalized.matter_id}`}>خريطة القضية</Link>
                </div>
              </div>
            ) : isSample ? (
              <p className="text-sm text-muted-foreground">غير متاح في المثال التوضيحي.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="matter-name">اسم الملف</Label>
                  <Input id="matter-name" value={matterName} maxLength={200} onChange={(e) => setMatterName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="matter-type">نوع الملف (اختياري)</Label>
                  <Input id="matter-type" value={matterType} maxLength={100} onChange={(e) => setMatterType(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">
                  العميل: {content.fields.client.status === "not_provided" ? <span className="text-danger">لم يُحدَّد — حدّده في الملخص أولًا</span> : content.fields.client.value}
                </p>
                {dirty ? <p className="text-xs text-verify">لديك تعديلات غير محفوظة على الملخص؛ احفظها أولًا.</p> : null}
                <Button onClick={() => setConfirmOpen(true)} disabled={editing || !matterName.trim() || content.fields.client.status === "not_provided"}>
                  <FolderPlus aria-hidden />
                  إنشاء الملف من الملخص
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="إنشاء الملف من ملخص الاستقبال"
        description="سيتحول الاستقبال إلى ملف نشط بالبيانات المحفوظة، ولن يمكن تعديل الملخص بعدها. الحقول التي لم تُقدَّم تبقى فارغة."
        acknowledgement="راجعتُ ملخص الاستقبال، وأعلم أن ما وُسم مستنتجًا أو غير واضح يتطلب تأكيدًا من العميل"
        confirmLabel="إنشاء الملف"
        onConfirm={finalize}
      />
    </div>
  );
}

function ListEditor<T extends { id?: string }>({
  items,
  onChange,
  render,
  blank,
  addLabel,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, update: (next: T) => void) => ReactNode;
  blank: Omit<T, "id">;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={item.id ?? `new-${index}`} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">{render(item, (next) => onChange(items.map((it, i) => (i === index ? next : it))))}</div>
          <Button size="icon" variant="ghost" aria-label="حذف" onClick={() => onChange(items.filter((_, i) => i !== index))}>
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="secondary" onClick={() => onChange([...items, { ...blank } as T])}>
        <Plus aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}
