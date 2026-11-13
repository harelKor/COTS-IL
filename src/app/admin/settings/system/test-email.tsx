"use client";

import { useTransition } from "react";
import { Button } from "@/components/form";
import { showToast } from "@/components/toast";
import { sendTestEmail } from "./actions";

/** "שליחת מייל בדיקה"; off, with the reason under it, while email isn't set up. */
export function TestEmailButton({ unavailable }: { unavailable: string | null }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="secondary"
        disabled={pending || !!unavailable}
        aria-describedby={unavailable ? "test-email-reason" : undefined}
        onClick={() =>
          start(async () => {
            const r = await sendTestEmail();
            showToast(r.ok ? (r.message ?? "נשלח") : r.error, r.ok ? "default" : "error");
          })
        }
      >
        {pending ? "שולח…" : "שליחת מייל בדיקה"}
      </Button>
      {unavailable && (
        <p id="test-email-reason" className="text-caption text-muted">
          {unavailable}
        </p>
      )}
    </div>
  );
}
