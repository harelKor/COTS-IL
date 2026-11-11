"use client";

import { Copy, MessageCircle } from "lucide-react";
import { useActionState, useTransition } from "react";
import { Alert, Button, buttonClass, Field, Input } from "@/components/form";
import { showToast } from "@/components/toast";
import { inviteMember, removeMember, restoreMember, type InviteState } from "./actions";

/** Adds a sign-in email (S8): the link goes by email when email is on, and here with Copy and WhatsApp. */
export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMember, {} as InviteState);
  const share = state.link ? `הצטרפות לחשבון ${state.teamName ?? "הקבוצה"} ב-COTS-IL: ${state.link}` : "";

  return (
    <form action={action} className="flex flex-col gap-3">
      {state.error && <Alert>{state.error}</Alert>}
      {state.link && (
        <div role="status" className="flex flex-col gap-2 rounded-xl border border-success/40 bg-success/5 p-3 text-callout">
          <span>
            {state.emailed ? (
              <>
                שלחנו את קישור ההצטרפות אל <bdi dir="ltr">{state.email}</bdi>. אפשר גם להעביר אותו בעצמכם.
              </>
            ) : (
              "העבירו את הקישור לכתובת שהוספתם."
            )}{" "}
            הוא תקף לשבועיים, עובד רק עם הכתובת הזאת, ומוצג כאן רק פעם אחת.
          </span>
          <input
            dir="ltr"
            readOnly
            value={state.link}
            aria-label="קישור הצטרפות"
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 rounded-xl bg-subtle px-3 font-mono text-caption"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                navigator.clipboard.writeText(state.link!).then(
                  () => showToast("הקישור הועתק"),
                  () => showToast("לא הצלחנו להעתיק. סמנו את הקישור והעתיקו ידנית.", "error"),
                )
              }
            >
              <Copy size={16} aria-hidden /> העתקה
            </Button>
            <a href={`https://wa.me/?text=${encodeURIComponent(share)}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
              <MessageCircle size={16} aria-hidden /> וואטסאפ
            </a>
          </div>
        </div>
      )}
      <Field label="דוא״ל" name="email">
        <Input name="email" type="email" dir="ltr" required />
      </Field>
      <Button disabled={pending} className="self-start">
        הוספת כתובת
      </Button>
    </form>
  );
}

/** "הסרה" with no confirm dialog: the address goes at once, and the toast's "ביטול" brings it back. */
export function RemoveMember({ userId, email }: { userId: string; email: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-label={`הסרת ${email}`}
      className="flex min-h-11 items-center px-3 text-callout text-danger hover:underline disabled:opacity-60"
      onClick={() =>
        start(async () => {
          const form = new FormData();
          form.set("userId", userId);
          const res = await removeMember({}, form);
          if (res.error) return showToast(res.error, "error");
          showToast(`${email} הוסרה מהחשבון`, "default", {
            label: "ביטול",
            run: async () => {
              const back = await restoreMember(userId);
              showToast(back.error ?? `${email} הוחזרה`, back.error ? "error" : "default");
            },
          });
        })
      }
    >
      הסרה
    </button>
  );
}
