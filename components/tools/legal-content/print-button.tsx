"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog, where "Save as PDF" produces the file. */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer aria-hidden />
      طباعة / حفظ PDF
    </Button>
  );
}
