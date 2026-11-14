"use client";

import { useId, useRef, useState, type DragEvent } from "react";
import { FileUp, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UPLOAD_ACCEPT, UPLOAD_MAX_BYTES } from "@/config/constants";
import { cn, formatFileSize } from "@/lib/utils";

type UploadState =
  | { kind: "idle" }
  | { kind: "selected"; files: File[] }
  | { kind: "error"; message: string };

interface UploadAreaProps {
  /** Called with validated files. Storage upload is wired here in a later step. */
  onFilesSelected?: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  /** Shown under the file list while the storage integration is pending. */
  pendingNotice?: string;
}

const ACCEPTED_TYPES = Object.keys(UPLOAD_ACCEPT);
const ACCEPTED_EXTENSIONS = Object.values(UPLOAD_ACCEPT).flat();

function validate(files: File[]): string | null {
  for (const file of files) {
    const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
    const typeOk = ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.some((ext) => ext === extension);
    if (!typeOk) return `الملف «${file.name}» غير مدعوم. الصيغ المقبولة: PDF و DOCX.`;
    if (file.size > UPLOAD_MAX_BYTES) return `الملف «${file.name}» يتجاوز الحد الأقصى (${formatFileSize(UPLOAD_MAX_BYTES)}).`;
  }
  return null;
}

export function UploadArea({ onFilesSelected, multiple = true, disabled = false, pendingNotice }: UploadAreaProps) {
  const inputId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  function handleFiles(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    const error = validate(files);
    if (error) {
      setState({ kind: "error", message: error });
      return;
    }
    setState({ kind: "selected", files });
    onFilesSelected?.(files);
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
          PDF أو DOCX — حتى {formatFileSize(UPLOAD_MAX_BYTES)} للملف
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={[...ACCEPTED_TYPES, ...ACCEPTED_EXTENSIONS].join(",")}
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

        {state.kind === "selected" ? (
          <div className="mt-3 rounded-md border border-border bg-surface">
            <ul className="divide-y divide-border">
              {state.files.map((file) => (
                <li key={`${file.name}-${file.size}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="tabular text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
              <p className="text-xs text-muted-foreground">{pendingNotice ?? "تم اختيار الملفات."}</p>
              <Button variant="ghost" size="sm" onClick={() => setState({ kind: "idle" })}>
                <X aria-hidden />
                مسح
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
