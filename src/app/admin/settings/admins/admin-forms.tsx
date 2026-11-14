"use client";

import { useTransition } from "react";
import { Button } from "@/components/form";
import { showToast } from "@/components/toast";
import { addAdmin, removeAdmin } from "../actions";
import { setAdminEmails } from "../emails/actions";

/** "הסרה" with an Undo toast; the server refuses to remove the last admin. */
export function RemoveAdminButton({ email, disabled }: { email: string; disabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="danger"
      disabled={pending || disabled}
      title={disabled ? "אי אפשר להסיר את המנהל האחרון" : undefined}
      aria-label={`הסרת ${email} מהמנהלים`}
      onClick={() =>
        start(async () => {
          const r = await removeAdmin(email);
          if (!r.ok) return showToast(r.error, "error");
          showToast(r.message ?? "הוסר", "default", {
            label: "ביטול",
            run: () => {
              const f = new FormData();
              f.set("email", email);
              void addAdmin(null, f);
            },
          });
        })
      }
    >
      {pending ? "מסיר…" : "הסרה"}
    </Button>
  );
}

/** Whether this admin gets the site's emails: a checkbox, saved on change. */
export function AdminEmailToggle({ userId, email, on }: { userId: string; email: string; on: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex min-h-11 items-center gap-2 text-callout">
      <input
        type="checkbox"
        defaultChecked={on}
        disabled={pending}
        aria-label={`${email} מקבל/ת מיילים מהאתר`}
        className="size-5 accent-brand"
        onChange={(e) =>
          start(async () => {
            const r = await setAdminEmails(userId, e.currentTarget.checked);
            showToast(r.ok ? (r.message ?? "נשמר") : r.error, r.ok ? "default" : "error");
          })
        }
      />
      מקבל/ת מיילים
    </label>
  );
}
