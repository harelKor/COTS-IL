"use client";

import { useTransition } from "react";
import { Button } from "@/components/form";
import { showToast } from "@/components/toast";
import { addAdmin, removeAdmin } from "../actions";

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
