"use client";

import { Button } from "@/components/form";

/** Hebrew PDFs come from the browser's "Save as PDF", which renders RTL text correctly. */
export function PrintButton() {
  return (
    <Button variant="secondary" type="button" onClick={() => window.print()} className="print:hidden">
      הדפסה / PDF
    </Button>
  );
}
