import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentCards } from "@/components/tools/legal-content/content-card";
import { PrintButton } from "@/components/tools/legal-content/print-button";
import { createSupabaseServerClient, getSessionState } from "@/lib/supabase/server";
import { getLegalContent } from "@/lib/tools/legal-content/service";
import { buildContentView } from "@/lib/tools/legal-content/view";

export const metadata: Metadata = { title: "طباعة المحتوى" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ outputId: string }>;
}

/**
 * Export view: only the cards, each printed on a page of its own canvas size
 * (documents on A4). Protected like the workspace: the middleware redirects
 * anonymous visitors and the content is read under the user's session (RLS).
 */
export default async function LegalContentPrintPage({ params }: Props) {
  const session = await getSessionState();
  if (session.kind !== "authenticated") redirect("/login");
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/login");

  const { outputId } = await params;
  const result = await getLegalContent(supabase, outputId);
  if (!result.ok) {
    if (result.error.code === "not_found") notFound();
    return <p className="p-8 text-sm text-danger">{result.error.message}</p>;
  }
  const { output, content, references } = result.data;
  const view = buildContentView(content, references);
  const { canvas } = view;
  const fixed = canvas.height !== null;
  const pageCss = fixed
    ? `@page { size: ${canvas.width}px ${canvas.height}px; margin: 0; }
       .cs-print-sheet { width: ${canvas.width}px; }
       .cs-print-sheet .cs-card { break-after: page; }
       .cs-print-sheet .cs-card:last-child { break-after: auto; }`
    : `@page { size: A4; margin: 0; }
       .cs-print-sheet { width: ${canvas.width}px; }`;

  return (
    <div dir="rtl" className="min-h-screen bg-surface-muted print:bg-white">
      <style>{`${pageCss}
        @media print { .cs-no-print { display: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        @media screen { .cs-print-sheet .cs-card { margin: 0 auto 24px; box-shadow: 0 1px 4px rgb(0 0 0 / 0.12); } }`}</style>
      <div className="cs-no-print mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div>
          <h1 className="font-semibold">{output.title}</h1>
          <p className="text-xs text-muted-foreground">
            {view.spec.label} · {canvas.sizeLabel}
            {fixed ? ` · ${view.spec.layout === "slides" ? view.cards.length : 1} صفحة` : ""}
            {output.status !== "approved" ? " · مسودة غير معتمدة" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <Link href={`/tools/legal-content/${output.id}`} className="self-center text-sm text-primary hover:underline">
            العودة إلى التحرير
          </Link>
        </div>
      </div>
      <main className="cs-print-sheet mx-auto max-w-full px-0 pb-8 print:p-0" data-testid="print-sheet">
        <ContentCards view={view} approved={output.status === "approved"} />
      </main>
    </div>
  );
}
