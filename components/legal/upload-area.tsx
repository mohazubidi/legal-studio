"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, FileText, FileUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UPLOAD_ACCEPT, UPLOAD_FORMATS_LABEL, UPLOAD_MAX_BYTES } from "@/config/constants";
import { useDocumentUpload, type UploadItem } from "@/hooks/use-document-upload";
import { precheckUpload } from "@/lib/documents/validation";
import { cn, formatFileSize } from "@/lib/utils";
import type { DocumentRow } from "@/types/database";

type UploadState =
  | { kind: "idle" }
  | { kind: "selected"; files: File[] }
  | { kind: "error"; message: string };

interface UploadAreaProps {
  /**
   * When set, files are uploaded to this matter's private storage and each
   * file's progress, result or error is shown. Without it the component only
   * selects and validates files (used by previews and the design system).
   */
  matterId?: string;
  onUploaded?: (document: DocumentRow) => void;
  /** Called with validated files in select-only mode. */
  onFilesSelected?: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  /** Shown under the file list in select-only mode. */
  pendingNotice?: string;
}

const ACCEPT_ATTRIBUTE = [...Object.keys(UPLOAD_ACCEPT), ...Object.values(UPLOAD_ACCEPT).flat()].join(",");

export function UploadArea(props: UploadAreaProps) {
  return props.matterId ? (
    <UploadingArea {...props} matterId={props.matterId} />
  ) : (
    <DropZone
      {...props}
      onFiles={(files) => props.onFilesSelected?.(files)}
      renderSelection={(files, reset) => (
        <SelectedFiles files={files} notice={props.pendingNotice ?? "تم اختيار الملفات."} onClear={reset} />
      )}
    />
  );
}

function UploadingArea({ matterId, onUploaded, multiple, disabled }: UploadAreaProps & { matterId: string }) {
  const router = useRouter();
  const { items, busy, upload, clear } = useDocumentUpload(matterId, { onUploaded });
  // Re-render the server-side source list once the batch is stored, including failed
  // attempts (they are kept as failed sources), so the new files can be processed.
  const uploadAndRefresh = (files: File[]) => void upload(files).then(() => router.refresh());
  return (
    <div>
      <DropZone multiple={multiple} disabled={disabled} onFiles={uploadAndRefresh} />
      {items.length > 0 ? <UploadList items={items} busy={busy} onClear={clear} /> : null}
    </div>
  );
}

interface DropZoneProps {
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  renderSelection?: (files: File[], reset: () => void) => ReactNode;
}

function DropZone({ multiple = true, disabled = false, onFiles, renderSelection }: DropZoneProps) {
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  function handleFiles(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    const error = files.map(precheckUpload).find((message) => message !== null);
    if (error) {
      setState({ kind: "error", message: error });
      return;
    }
    setState(renderSelection ? { kind: "selected", files } : { kind: "idle" });
    onFiles(files);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) handleFiles(event.dataTransfer.files);
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors duration-150",
          dragging ? "border-accent bg-accent-soft" : "border-border-strong bg-surface",
          state.kind === "error" && "border-danger/60",
          disabled && "opacity-60",
        )}
      >
        <FileUp className="mb-3 size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          {dragging ? "أفلت الملفات هنا" : "اسحب المستندات وأفلتها هنا"}
        </p>
        <p id={hintId} className="mt-1 text-xs text-muted-foreground">
          {UPLOAD_FORMATS_LABEL} — حتى {formatFileSize(UPLOAD_MAX_BYTES)} للملف
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={ACCEPT_ATTRIBUTE}
          multiple={multiple}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <Button variant="secondary" size="sm" className="mt-4" disabled={disabled} onClick={() => inputRef.current?.click()}>
          اختيار ملفات
        </Button>
      </div>

      <div aria-live="polite">
        {state.kind === "error" ? (
          <p role="alert" className="mt-3 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.message}
          </p>
        ) : null}
        {state.kind === "selected" && renderSelection
          ? renderSelection(state.files, () => setState({ kind: "idle" }))
          : null}
      </div>
    </div>
  );
}

function SelectedFiles({ files, notice, onClear }: { files: File[]; notice: string; onClear: () => void }) {
  return (
    <div className="mt-3 rounded-md border border-border bg-surface">
      <ul className="divide-y divide-border">
        {files.map((file) => (
          <li key={`${file.name}-${file.size}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="tabular text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
        <p className="text-xs text-muted-foreground">{notice}</p>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X aria-hidden />
          مسح
        </Button>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<UploadItem["status"], string> = {
  queued: "في الانتظار",
  uploading: "جارٍ الرفع",
  done: "تم الرفع",
  failed: "فشل الرفع",
};

function UploadList({ items, busy, onClear }: { items: UploadItem[]; busy: boolean; onClear: () => void }) {
  return (
    <div className="mt-3 rounded-md border border-border bg-surface" aria-live="polite">
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.key} className="px-4 py-2.5 text-sm">
            <div className="flex items-center gap-3">
              {item.status === "done" ? (
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
              ) : item.status === "failed" ? (
                <AlertCircle className="size-4 shrink-0 text-danger" aria-hidden />
              ) : item.status === "uploading" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">{item.fileName}</span>
              <span className="tabular text-xs text-muted-foreground">
                {item.status === "uploading" ? `${item.progress}%` : formatFileSize(item.size)}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  item.status === "done" && "text-success",
                  item.status === "failed" && "text-danger",
                  (item.status === "queued" || item.status === "uploading") && "text-muted-foreground",
                )}
              >
                {STATUS_LABEL[item.status]}
              </span>
            </div>
            {item.status === "uploading" ? (
              <div
                className="mt-2 h-1 overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
                aria-label={`رفع ${item.fileName}`}
                aria-valuenow={item.progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full bg-primary transition-[width]" style={{ width: `${item.progress}%` }} />
              </div>
            ) : null}
            {item.error ? (
              <p role="alert" className="mt-1.5 text-xs text-danger">
                {item.error}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex justify-end border-t border-border px-4 py-2">
        <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
          <X aria-hidden />
          مسح القائمة
        </Button>
      </div>
    </div>
  );
}
