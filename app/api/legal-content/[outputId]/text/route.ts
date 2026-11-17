import { type NextRequest } from "next/server";
import { authorize, dataError } from "@/lib/api/responses";
import { getLegalContent } from "@/lib/tools/legal-content/service";
import { buildContentView, contentToText, exportFileName } from "@/lib/tools/legal-content/view";

export const runtime = "nodejs";

/** The saved content as a UTF-8 text file (title, sections, quotes with locations, source, disclaimer). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ outputId: string }> }) {
  const auth = await authorize();
  if (!auth.ok) return auth.response;
  const { outputId } = await params;
  const result = await getLegalContent(auth.supabase, outputId);
  if (!result.ok) return dataError(result.error);

  const view = buildContentView(result.data.content, result.data.references);
  const name = exportFileName(result.data.content.title, "txt");
  // Byte-order mark: Windows editors otherwise misread Arabic UTF-8 text.
  return new Response(`﻿${contentToText(view)}`, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="legal-content.txt"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
