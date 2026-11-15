import { NextResponse, type NextRequest } from "next/server";
import { authorize, dataError } from "@/lib/api/responses";
import { deleteDocument, getDocument } from "@/lib/data/documents";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { documentId } = await params;

  const result = await getDocument(auth.supabase, documentId);
  if (!result.ok) return dataError(result.error);
  return NextResponse.json({ document: result.data }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { documentId } = await params;

  const result = await deleteDocument(auth.supabase, documentId);
  if (!result.ok) return dataError(result.error);
  return new NextResponse(null, { status: 204 });
}
