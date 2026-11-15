"use client";

import { useCallback, useRef, useState } from "react";
import type { DocumentRow } from "@/types/database";

export type UploadItemStatus = "queued" | "uploading" | "done" | "failed";

export interface UploadItem {
  key: string;
  fileName: string;
  size: number;
  status: UploadItemStatus;
  /** 0–100 while uploading. */
  progress: number;
  error?: string;
  document?: DocumentRow;
}

export interface DocumentUploadMetadata {
  document_category?: string;
  document_date?: string;
}

interface ApiErrorBody {
  error?: { message?: string };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** POSTs one file with progress reporting. Resolves with the stored document or an Arabic error. */
function sendFile(
  url: string,
  file: File,
  metadata: DocumentUploadMetadata,
  onProgress: (percent: number) => void,
): Promise<{ ok: true; document: DocumentRow } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    const body = new FormData();
    body.append("file", file);
    if (metadata.document_category) body.append("document_category", metadata.document_category);
    if (metadata.document_date) body.append("document_date", metadata.document_date);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      const json = parseJson(xhr.responseText);
      if (xhr.status === 201 && json && typeof json === "object" && "document" in json) {
        resolve({ ok: true, document: (json as { document: DocumentRow }).document });
        return;
      }
      const message = (json as ApiErrorBody | null)?.error?.message;
      resolve({ ok: false, message: message ?? `تعذّر رفع الملف (رمز ${xhr.status}).` });
    };
    xhr.onerror = () => resolve({ ok: false, message: "انقطع الاتصال أثناء الرفع." });
    xhr.send(body);
  });
}

/**
 * Uploads documents to a matter, one at a time, tracking each file's status.
 * All authorization and validation happens on the server; this hook only reports.
 */
export function useDocumentUpload(matterId: string, options: { onUploaded?: (document: DocumentRow) => void } = {}) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const onUploaded = useRef(options.onUploaded);
  onUploaded.current = options.onUploaded;

  const patch = useCallback((key: string, change: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const upload = useCallback(
    async (files: File[], metadata: DocumentUploadMetadata = {}) => {
      const queued = files.map((file) => ({
        file,
        item: {
          key: `${file.name}-${file.size}-${crypto.randomUUID()}`,
          fileName: file.name,
          size: file.size,
          status: "queued" as const,
          progress: 0,
        },
      }));
      setItems((current) => [...current, ...queued.map((entry) => entry.item)]);
      setBusy(true);

      const url = `/api/matters/${encodeURIComponent(matterId)}/documents`;
      for (const { file, item } of queued) {
        patch(item.key, { status: "uploading" });
        const result = await sendFile(url, file, metadata, (progress) => patch(item.key, { progress }));
        if (result.ok) {
          patch(item.key, { status: "done", progress: 100, document: result.document });
          onUploaded.current?.(result.document);
        } else {
          patch(item.key, { status: "failed", error: result.message });
        }
      }
      setBusy(false);
    },
    [matterId, patch],
  );

  const clear = useCallback(() => setItems((current) => current.filter((item) => item.status === "uploading")), []);

  return { items, busy, upload, clear };
}
