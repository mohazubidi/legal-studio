import { NextResponse, type NextRequest } from "next/server";
import { authorize, dataError } from "@/lib/api/responses";
import { createDocumentDownloadUrl } from "@/lib/data/documents";

export const runtime = "nodejs";

/** Redirects to a 60-second signed URL for a document the caller owns. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { documentId } = await params;

  const result = await createDocumentDownloadUrl(auth.supabase, documentId);
  if (!result.ok) return dataError(result.error);

  const response = NextResponse.redirect(result.data.url, 302);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
