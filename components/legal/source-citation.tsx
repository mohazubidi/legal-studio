"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Citation } from "@/types/legal";

interface SourceCitationProps {
  citation: Citation;
  /** Ordinal shown in the chip, e.g. 1 → "م١". */
  index: number;
}

/** Inline citation chip. Opens a popover with the quoted excerpt and a link to the exact paragraph. */
export function SourceCitation({ citation, index }: SourceCitationProps) {
  const href = citation.href ?? `/documents/${citation.documentId}${citation.anchor ? `#${citation.anchor}` : ""}`;
  const number = citation.number ?? index;
  const location = citation.location ?? (citation.page !== undefined ? `صفحة ${citation.page}` : "موضع غير محدد");
  const shortLocation = citation.location ?? (citation.page !== undefined ? `ص ${citation.page}` : "");
  return (
    <Popover>
      <PopoverTrigger
        className="tabular mx-0.5 inline-flex h-5 items-center rounded-sm border border-source/30 bg-source-soft px-1.5 align-baseline text-[11px] font-medium text-source hover:border-source/60"
        aria-label={`المصدر ${number}: ${citation.documentName}، ${location}`}
      >
        {shortLocation ? `م ${number} · ${shortLocation}` : `م ${number}`}
      </PopoverTrigger>
      <PopoverContent>
        <div className="mb-3 flex items-start gap-2">
          <FileText className="mt-0.5 size-4 shrink-0 text-source" aria-hidden />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{citation.documentName}</p>
            <p className="tabular text-xs text-muted-foreground">{location}</p>
          </div>
        </div>
        <blockquote className="border-s-2 border-source bg-source-soft/60 px-3 py-2 font-serif text-[15px] leading-8 text-foreground">
          «{citation.excerpt}»
        </blockquote>
        <Link href={href} className="mt-3 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline">
          عرض الموضع في المستند
        </Link>
      </PopoverContent>
    </Popover>
  );
}
