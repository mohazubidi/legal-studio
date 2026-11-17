import { ErrorState } from "@/components/legal/empty-state";
import { UploadArea } from "@/components/legal/upload-area";
import { getTranscriptionConfig } from "@/lib/ai/config";
import type { DataResult } from "@/lib/data/result";
import type { DocumentRow } from "@/types/database";
import { SourcesPanel } from "./sources-panel";
import { TextSourceForm, type TextSourceKind } from "./text-source-form";

/** Stage 1 for a matter: its sources with processing state, plus file upload and pasted text. */
export function MatterSources({ matterId, documents, textKinds }: { matterId: string; documents: DataResult<DocumentRow[]>; textKinds?: TextSourceKind[] }) {
  return (
    <>
      {documents.ok ? (
        <SourcesPanel matterId={matterId} documents={documents.data} transcriptionConfigured={getTranscriptionConfig() !== null} />
      ) : (
        <ErrorState title="تعذّر تحميل المصادر" description={documents.error.message} />
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">رفع ملفات</h3>
        <UploadArea matterId={matterId} />
        <p className="mt-2 text-xs text-muted-foreground">بعد الرفع اضغط «معالجة المصادر». النصوص الملصقة وملفات TXT تُعالج مباشرة.</p>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">إضافة نص</h3>
        <TextSourceForm matterId={matterId} kinds={textKinds} />
      </div>
    </>
  );
}
