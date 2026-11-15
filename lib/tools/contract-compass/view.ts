import { numberReferences, resolveSourceLinks, type SourceLink } from "@/lib/tools/shared/source-links";
import type { NormalizedDate } from "@/lib/tools/shared/dates";
import type { SourceReferenceRow } from "@/types/database";
import {
  MISSING_KIND_LABELS,
  REVIEW_LABELS,
  TERM_LABELS,
  TERM_STATUS_LABELS,
  type ContractContent,
  type ContractTerm,
} from "./content";
import { TERM_KEYS, type TermKey } from "./model-schema";

/** Shown wherever the contract does not state a value. Never replaced by a guess. */
export const NOT_SPECIFIED = "غير محدد في العقد";
export const AMOUNT_NOT_VERIFIED = "لم يُتحقق من المبلغ في النص";

export const CONTRACT_VIEWS = ["snapshot", "obligations", "deadlines", "financial", "review", "missing"] as const;
export type ContractView = (typeof CONTRACT_VIEWS)[number];

export interface TermRow {
  id: string;
  key: TermKey;
  label: string;
  status: ContractTerm["status"];
  statusLabel: string;
  value: string;
  clause: string | null;
  links: SourceLink[];
  referenced: boolean;
}

export interface ObligationRow {
  id: string;
  obligation: string;
  responsible: string[];
  deadline: string;
  deadlineIso: string | null;
  clause: string | null;
  links: SourceLink[];
  referenced: boolean;
}

export interface DeadlineRow {
  id: string;
  itemId: string;
  kind: "obligation" | "payment" | "notice" | "term";
  kindLabel: string;
  label: string;
  when: string;
  iso: string | null;
  clause: string | null;
  links: SourceLink[];
}

export interface PaymentRow {
  id: string;
  description: string;
  amount: string;
  amountVerified: boolean;
  currency: string | null;
  due: string;
  clause: string | null;
  links: SourceLink[];
  referenced: boolean;
}

export interface ReviewRow {
  id: string;
  topic: string;
  label: string;
  note: string;
  noteReplaced: boolean;
  clause: string | null;
  links: SourceLink[];
  referenced: boolean;
}

export interface MissingRow {
  id: string;
  kindLabel: string;
  text: string;
  links: SourceLink[];
}

export interface ContractViewModel {
  parties: { id: string; name: string; role: string; links: SourceLink[]; referenced: boolean }[];
  terms: TermRow[];
  matrix: ObligationRow[];
  deadlines: DeadlineRow[];
  payments: PaymentRow[];
  review: ReviewRow[];
  missing: MissingRow[];
  counts: Record<ContractView, number>;
}

function formatDate(date: NormalizedDate | null, fallback: string | null): string {
  // The Gregorian date is wrapped in Unicode isolates (LRI…PDI) so it keeps its order inside Arabic text.
  if (date?.text) return date.converted && date.iso ? `${date.text} (≈ \u2066${date.iso}\u2069 م)` : date.text;
  return fallback ?? NOT_SPECIFIED;
}

/** Reference numbering in the order the views list items. */
export function numberContractReferences(content: ContractContent): Map<string, number> {
  return numberReferences([
    ...content.parties.map((p) => p.reference_ids),
    ...TERM_KEYS.map((key) => content.terms[key].reference_ids),
    ...content.notice_periods.map((n) => n.reference_ids),
    ...content.obligations.map((o) => o.reference_ids),
    ...content.payments.map((p) => p.reference_ids),
    ...content.review_items.map((r) => r.reference_ids),
    ...content.missing.map((m) => m.reference_ids),
  ]);
}

/** Everything the six views render, derived only from verified content. */
export function buildContractView(content: ContractContent, references: SourceReferenceRow[]): ContractViewModel {
  const numbers = numberContractReferences(content);
  const names = new Map(content.sources.map((s) => [s.document_id, s.file_name]));
  const links = (ids: string[]) => resolveSourceLinks(ids, references, names, numbers);
  const partyName = new Map(content.parties.map((p) => [p.id, p.name]));

  const terms: TermRow[] = TERM_KEYS.map((key) => {
    const term = content.terms[key];
    const date = key === "effective_date" ? content.terms.effective_date.date : null;
    const value =
      term.status === "not_stated" ? NOT_SPECIFIED : date ? `${formatDate(date, null)}${term.summary ? ` — ${term.summary}` : ""}` : term.summary || NOT_SPECIFIED;
    const termLinks = links(term.reference_ids);
    return {
      id: `term:${key}`,
      key,
      label: TERM_LABELS[key],
      status: term.status,
      statusLabel: TERM_STATUS_LABELS[term.status],
      value,
      clause: term.clause,
      links: termLinks,
      referenced: termLinks.length > 0,
    };
  });

  const matrix: ObligationRow[] = content.obligations.map((item) => {
    const itemLinks = links(item.reference_ids);
    return {
      id: item.id,
      obligation: item.description,
      responsible: item.responsible_party_ids.length ? item.responsible_party_ids.map((id) => partyName.get(id) ?? "طرف غير معرّف") : [NOT_SPECIFIED],
      deadline: item.deadline_date || item.deadline_text ? formatDate(item.deadline_date, item.deadline_text) : NOT_SPECIFIED,
      deadlineIso: item.deadline_date?.iso ?? null,
      clause: item.clause,
      links: itemLinks,
      referenced: itemLinks.length > 0,
    };
  });

  const deadlines: DeadlineRow[] = [
    ...content.obligations
      .filter((o) => o.deadline_date || o.deadline_text)
      .map((o) => ({
        id: `deadline:${o.id}`,
        itemId: o.id,
        kind: "obligation" as const,
        kindLabel: "التزام",
        label: o.description,
        when: formatDate(o.deadline_date, o.deadline_text),
        iso: o.deadline_date?.iso ?? null,
        clause: o.clause,
        links: links(o.reference_ids),
      })),
    ...content.payments
      .filter((p) => p.due_date || p.due_text)
      .map((p) => ({
        id: `deadline:${p.id}`,
        itemId: p.id,
        kind: "payment" as const,
        kindLabel: "دفعة",
        label: p.description,
        when: formatDate(p.due_date, p.due_text),
        iso: p.due_date?.iso ?? null,
        clause: p.clause,
        links: links(p.reference_ids),
      })),
    ...content.notice_periods.map((n) => ({
      id: `deadline:${n.id}`,
      itemId: n.id,
      kind: "notice" as const,
      kindLabel: "مهلة إخطار",
      label: n.purpose || "إخطار",
      when: n.period_text,
      iso: null,
      clause: n.clause,
      links: links(n.reference_ids),
    })),
    ...(content.terms.effective_date.date
      ? [
          {
            id: "deadline:term:effective_date",
            itemId: "term:effective_date",
            kind: "term" as const,
            kindLabel: "سريان العقد",
            label: TERM_LABELS.effective_date,
            when: formatDate(content.terms.effective_date.date, null),
            iso: content.terms.effective_date.date.iso,
            clause: content.terms.effective_date.clause,
            links: links(content.terms.effective_date.reference_ids),
          },
        ]
      : []),
  ].sort((a, b) => {
    if (a.iso && b.iso) return a.iso.localeCompare(b.iso);
    if (a.iso) return -1;
    if (b.iso) return 1;
    return 0;
  });

  const payments: PaymentRow[] = content.payments.map((p) => {
    const itemLinks = links(p.reference_ids);
    return {
      id: p.id,
      description: p.description,
      amount: p.amount_text ?? AMOUNT_NOT_VERIFIED,
      amountVerified: p.amount_text !== null,
      currency: p.currency,
      due: p.due_date || p.due_text ? formatDate(p.due_date, p.due_text) : NOT_SPECIFIED,
      clause: p.clause,
      links: itemLinks,
      referenced: itemLinks.length > 0,
    };
  });

  const review: ReviewRow[] = content.review_items.map((r) => {
    const itemLinks = links(r.reference_ids);
    return { id: r.id, topic: r.topic, label: REVIEW_LABELS[r.label], note: r.note, noteReplaced: r.note_replaced, clause: r.clause, links: itemLinks, referenced: itemLinks.length > 0 };
  });

  const missing: MissingRow[] = content.missing.map((m) => ({ id: m.id, kindLabel: MISSING_KIND_LABELS[m.kind], text: m.text, links: links(m.reference_ids) }));

  const parties = content.parties.map((p) => {
    const itemLinks = links(p.reference_ids);
    return { id: p.id, name: p.name, role: p.role, links: itemLinks, referenced: itemLinks.length > 0 };
  });

  return {
    parties,
    terms,
    matrix,
    deadlines,
    payments,
    review,
    missing,
    counts: {
      snapshot: terms.filter((t) => t.status === "stated").length,
      obligations: matrix.length,
      deadlines: deadlines.length,
      financial: payments.length,
      review: review.length,
      missing: missing.length,
    },
  };
}

export interface ContractItemDetail {
  id: string;
  kindLabel: string;
  title: string;
  detail: string | null;
  interpretation: string | null;
  referenced: boolean;
  meta: { label: string; value: string }[];
  links: SourceLink[];
}

/** Everything the source panel shows for one clicked item, found by id. */
export function findContractItem(view: ContractViewModel, id: string): ContractItemDetail | null {
  const clauseMeta = (clause: string | null) => ({ label: "البند", value: clause ?? "رقم البند غير متحقق منه" });
  const party = view.parties.find((p) => p.id === id);
  if (party) return { id, kindLabel: "طرف متعاقد", title: party.name, detail: party.role || null, interpretation: null, referenced: party.referenced, meta: [], links: party.links };
  const term = view.terms.find((t) => t.id === id);
  if (term) {
    return { id, kindLabel: term.label, title: term.value, detail: null, interpretation: null, referenced: term.referenced, meta: [{ label: "الحالة", value: term.statusLabel }, clauseMeta(term.clause)], links: term.links };
  }
  const obligation = view.matrix.find((o) => o.id === id);
  if (obligation) {
    return {
      id,
      kindLabel: "التزام",
      title: obligation.obligation,
      detail: null,
      interpretation: null,
      referenced: obligation.referenced,
      meta: [{ label: "الطرف المسؤول", value: obligation.responsible.join("، ") }, { label: "الموعد", value: obligation.deadline }, clauseMeta(obligation.clause)],
      links: obligation.links,
    };
  }
  const payment = view.payments.find((p) => p.id === id);
  if (payment) {
    return {
      id,
      kindLabel: "شرط مالي",
      title: payment.description,
      detail: null,
      interpretation: null,
      referenced: payment.referenced,
      meta: [{ label: "المبلغ", value: [payment.amount, payment.currency].filter(Boolean).join(" ") }, { label: "الاستحقاق", value: payment.due }, clauseMeta(payment.clause)],
      links: payment.links,
    };
  }
  const deadline = view.deadlines.find((d) => d.itemId === id && d.kind === "notice");
  if (deadline) {
    return { id, kindLabel: "مهلة إخطار", title: deadline.label, detail: deadline.when, interpretation: null, referenced: deadline.links.length > 0, meta: [clauseMeta(deadline.clause)], links: deadline.links };
  }
  const review = view.review.find((r) => r.id === id);
  if (review) {
    return { id, kindLabel: review.label, title: review.topic, detail: null, interpretation: review.note, referenced: review.referenced, meta: [clauseMeta(review.clause)], links: review.links };
  }
  const missing = view.missing.find((m) => m.id === id);
  if (missing) return { id, kindLabel: missing.kindLabel, title: missing.text, detail: null, interpretation: null, referenced: missing.links.length > 0, meta: [], links: missing.links };
  return null;
}
