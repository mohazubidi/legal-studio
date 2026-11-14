import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { DocumentViewer } from "@/components/legal/document-viewer";
import { PageHeader } from "@/components/legal/page-header";
import { getDocument, getMatter } from "@/data/mock";

interface Props {
  params: Promise<{ documentId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { documentId } = await params;
  return { title: getDocument(documentId)?.name ?? "مستند" };
}

export default async function DocumentPage({ params }: Props) {
  const { documentId } = await params;
  const document = getDocument(documentId);
  if (!document) notFound();

  return (
    <>
      <Link href="/documents" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" aria-hidden />
        المستندات
      </Link>
      <PageHeader titleEn="Document viewer" title={document.name} />
      <DocumentViewer document={document} matterTitle={getMatter(document.matterId)?.title} />
    </>
  );
}
