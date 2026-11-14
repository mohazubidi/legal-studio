"use client";

import { useState } from "react";
import { Check, Copy, PenSquare, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { APPROVAL_ACKNOWLEDGEMENT } from "@/config/constants";
import { PROVENANCE } from "@/config/provenance";
import { getToolName } from "@/config/tools";
import { formatDateTime } from "@/lib/utils";
import type { ReviewStatus, ToolResult } from "@/types/legal";
import { ConfirmDialog } from "./confirm-dialog";
import { ProvenanceItem, ProvenanceLegend } from "./provenance";
import { StatusBadge } from "./status-badge";

interface AIResultPanelProps {
  result: ToolResult;
  /** Hide review actions (e.g. in read-only previews). */
  readOnly?: boolean;
}

function toPlainText(result: ToolResult): string {
  const lines = [result.title, ""];
  for (const section of result.sections) {
    lines.push(section.title);
    for (const item of section.items) lines.push(`- [${PROVENANCE[item.type].labelAr}] ${item.text}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * The single surface on which AI output is shown. Every item is typed by provenance,
 * and approval requires an explicit human acknowledgement.
 * Review actions are local UI state until the AI workflow and persistence are implemented.
 */
export function AIResultPanel({ result, readOnly = false }: AIResultPanelProps) {
  const [status, setStatus] = useState<ReviewStatus>(result.status);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const verifyCount = result.sections.flatMap((s) => s.items).filter((i) => i.type === "verify").length;
  const missingCount = result.sections.flatMap((s) => s.items).filter((i) => i.type === "missing").length;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(toPlainText(result));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-col gap-3 sm:flex-row">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{getToolName(result.toolId)}</p>
          <h2 className="mt-0.5 text-base font-semibold">{result.title}</h2>
          <p className="tabular mt-1 text-xs text-muted-foreground">أُنشئ في {formatDateTime(result.generatedAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {result.isSample ? <StatusBadge status="draft" label="محتوى توضيحي" /> : null}
          <StatusBadge status={status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <section aria-label="دليل تصنيف المخرجات">
          <ProvenanceLegend compact />
        </section>

        {verifyCount + missingCount > 0 ? (
          <dl className="tabular flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-border bg-surface-muted px-3 py-2 text-xs">
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">عناصر تتطلب تحققًا:</dt>
              <dd className="font-semibold text-verify">{verifyCount}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-muted-foreground">معلومات ناقصة:</dt>
              <dd className="font-semibold text-missing">{missingCount}</dd>
            </div>
          </dl>
        ) : null}

        {result.sections.map((section) => (
          <section key={section.id} aria-labelledby={`section-${section.id}`}>
            <h3 id={`section-${section.id}`} className="mb-3 text-sm font-semibold text-foreground">
              {section.title}
            </h3>
            <ul className="space-y-2">
              {section.items.map((item) => (
                <ProvenanceItem key={item.id} item={item} />
              ))}
            </ul>
          </section>
        ))}
      </CardContent>

      {readOnly ? null : (
        <CardFooter>
          <Button onClick={() => setConfirmOpen(true)} disabled={status === "reviewed"}>
            <ShieldCheck aria-hidden />
            {status === "reviewed" ? "تم الاعتماد" : "اعتماد بعد المراجعة"}
          </Button>
          <Button variant="secondary" onClick={() => setStatus("in_review")} disabled={status === "reviewed"}>
            <PenSquare aria-hidden />
            طلب تعديل
          </Button>
          <Button variant="ghost" onClick={handleCopy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "تم النسخ" : "نسخ"}
          </Button>
          <span role="status" className="sr-only">
            {copied ? "تم نسخ المخرج" : ""}
          </span>
        </CardFooter>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="اعتماد المخرج"
        description={
          <p>
            الاعتماد يعني أن مختصًا راجع جميع العناصر، وتحقق من الإحالات، وعالج المعلومات الناقصة.
            {verifyCount > 0 ? ` عدد العناصر التي تتطلب تحققًا: ${verifyCount}.` : ""}
          </p>
        }
        confirmLabel="اعتماد"
        acknowledgement={APPROVAL_ACKNOWLEDGEMENT}
        onConfirm={() => setStatus("reviewed")}
      />
    </Card>
  );
}
