import { NextResponse, type NextRequest } from "next/server";
import { UPLOAD_MAX_BYTES } from "@/config/constants";
import { apiError, authorize, dataError } from "@/lib/api/responses";
import { listDocuments, uploadDocument } from "@/lib/data/documents";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ matterId: string }>;
}

/** Documents of a matter the caller owns. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { matterId } = await params;

  const result = await listDocuments(auth.supabase, matterId);
  if (!result.ok) return dataError(result.error);
  return NextResponse.json({ documents: result.data }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Upload one document (multipart/form-data):
 *   file               required
 *   document_category  optional, ≤ 100 chars
 *   document_date      optional, YYYY-MM-DD
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { matterId } = await params;

  // Reject oversized bodies before buffering them (1 MB allowance for multipart fields).
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > UPLOAD_MAX_BYTES + 1024 * 1024) {
    return apiError(413, "too_large", "حجم الطلب يتجاوز الحد المسموح.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError(400, "invalid_input", "يجب إرسال الملف بصيغة multipart/form-data.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return apiError(400, "invalid_input", "لم يُرفق أي ملف.");

  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : undefined;
  };

  const result = await uploadDocument(auth.supabase, {
    matterId,
    file,
    metadata: { document_category: text("document_category"), document_date: text("document_date") },
  });
  if (!result.ok) return dataError(result.error);
  return NextResponse.json({ document: result.data }, { status: 201 });
}
