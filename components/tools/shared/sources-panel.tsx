"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { FileAudio, FileText, RotateCcw, Trash2 } from "lucide-react";
import {
  processPendingSourcesAction,
  processSourceAction,
  removeSourceAction,
} from "@/app/(workspace)/tools/source-actions";
import { FileName } from "@/components/legal/file-name";
import { StatusBadge } from "@/components/legal/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatFileSize } from "@/lib/utils";
import type { LibraryFreshness } from "@/lib/library/format";
import { SOURCE_KIND_LABELS } from "@/lib/tools/shared/labels";
import type { DocumentRow } from "@/types/database";
import { ActionMessage } from "./action-message";


interface SourcesPanelProps {
  matterId: string;
  documents: Pick<
    DocumentRow,
    "id" | "file_name" | "file_size_bytes" | "source_kind" | "processing_status" | "processing_error" | "created_at" | "library_law_id"
  >[];
  transcriptionConfigured: boolean;
  /** Sources copied from the Legal Library, compared with the library now. */
  freshness?: Record<string, LibraryFreshness>;
}

/** Stage 1: every source with its processing state, error, and retry. */
export function SourcesPanel({ matterId, documents, transcriptionConfigured, freshness = {} }: SourcesPanelProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; tone: "error" | "success" } | null>(null);

  const waiting = documents.filter((doc) => doc.processing_status === "uploaded").length;

  function run(id: string, action: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    setBusyId(id);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      setMessage(result.ok ? { text: success, tone: "success" } : { text: result.message ?? "تعذّر التنفيذ.", tone: "error" });
    });
  }

  if (documents.length === 0) {
    return <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">لا توجد مصادر بعد. ارفع ملفات أو أضف نصًا.</p>;
  }

  return (
    <div className="space-y-3">
      {!transcriptionConfigured && documents.some((doc) => doc.source_kind === "audio_recording") ? (
        <p role="status" className="rounded-md border border-missing/30 bg-missing-soft px-3 py-2 text-sm text-missing">
          التفريغ الصوتي غير متاح على هذا الخادم، لذلك لن تُفرَّغ التسجيلات ولن تُستخدم في المذكرة حتى تُضبط خدمة التفريغ.
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-md border border-border bg-surface">
        {documents.map((doc) => {
          const Icon = doc.source_kind === "audio_recording" ? FileAudio : FileText;
          const busy = busyId === doc.id;
          const status = busy ? "processing" : doc.processing_status;
          return (
            <li key={doc.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    <FileName name={doc.file_name} />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {SOURCE_KIND_LABELS[doc.source_kind]} · <span className="tabular">{formatFileSize(doc.file_size_bytes)}</span> ·{" "}
                    {formatDateTime(doc.created_at)}
                  </p>
                </div>
                <StatusBadge status={status} />
                {doc.processing_status === "uploaded" || doc.processing_status === "failed" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(doc.id, () => processSourceAction(doc.id), `عولج «${doc.file_name}».`)}
                  >
                    <RotateCcw aria-hidden />
                    {doc.processing_status === "failed" ? "إعادة المحاولة" : "معالجة"}
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={pending}
                  aria-label={`حذف ${doc.file_name}`}
                  onClick={() => {
                    if (window.confirm(`حذف «${doc.file_name}» نهائيًا؟`)) {
                      run(doc.id, () => removeSourceAction(doc.id), `حُذف «${doc.file_name}».`);
                    }
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {freshness[doc.id] === "changed" ? (
                <p className="mt-2 rounded-sm bg-verify-soft px-2 py-1 text-xs leading-5 text-verify">
                  تغيّر نص هذا النظام في مكتبة الأنظمة بعد إضافته، والنسخة هنا لم تتغير.{" "}
                  {doc.library_law_id ? (
                    <Link href={`/library/${doc.library_law_id}`} className="font-medium underline underline-offset-4">
                      راجع النص الحالي
                    </Link>
                  ) : null}
                </p>
              ) : freshness[doc.id] === "removed" ? (
                <p className="mt-2 rounded-sm bg-verify-soft px-2 py-1 text-xs leading-5 text-verify">حُذف هذا النظام من مكتبة الأنظمة بعد إضافته. تحقّق من المصدر الرسمي.</p>
              ) : null}
              {doc.processing_error ? (
                <p className="mt-2 rounded-sm bg-danger-soft px-2 py-1 text-xs leading-5 text-danger">{doc.processing_error}</p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <ActionMessage message={message?.text ?? null} tone={message?.tone ?? "success"} />

      {waiting > 0 ? (
        <Button
          onClick={() =>
            run("all", async () => {
              const result = await processPendingSourcesAction(matterId);
              if (!result.ok) return result;
              const { processed, failed } = result.data;
              return failed > 0
                ? { ok: false, message: `عولج ${processed} مصدرًا، وتعذّرت معالجة ${failed}. راجع الأخطاء أعلاه.` }
                : { ok: true };
            }, "اكتملت معالجة المصادر.")
          }
          disabled={pending}
          aria-busy={(pending && busyId === "all") || undefined}
        >
          {pending && busyId === "all" ? "جارٍ معالجة المصادر…" : `معالجة المصادر (${waiting})`}
        </Button>
      ) : null}
    </div>
  );
}
