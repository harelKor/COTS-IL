"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClass, fieldClass } from "@/components/form";
import { showToast } from "@/components/toast";
import { removePin, restorePins, savePin } from "./pin-actions";

/** Pins a family at a place in "מומלץ". Saving regroups the catalog (about 10 s). */
export function PinForm() {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={form}
      className="flex flex-wrap items-end gap-2"
      action={(data) =>
        start(async () => {
          const r = await savePin(data);
          showToast(r.ok ? r.message : r.error, r.ok ? "default" : "error");
          if (r.ok) {
            form.current?.reset();
            router.refresh();
          }
        })
      }
    >
      <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-callout">
        קישור לדף המוצר, slug או מק״ט
        <input name="family" required dir="ltr" className={fieldClass} />
      </label>
      <label className="flex w-28 flex-col gap-1 text-callout">
        מקום
        <input name="rank" type="number" min={1} max={999} required inputMode="numeric" defaultValue={1} className={fieldClass} />
      </label>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "מצמיד…" : "הצמדה"}
      </Button>
    </form>
  );
}

/** "הסרה" with Undo instead of a confirm dialog. */
export function UnpinButton({ slug }: { slug: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass("ghost", "shrink-0 px-3")}
      onClick={() =>
        start(async () => {
          const r = await removePin(slug);
          if (!r.ok) return showToast(r.error, "error");
          router.refresh();
          const removed = r.removed ?? [];
          showToast(r.message, "default", {
            label: "ביטול",
            run: () =>
              void restorePins(removed).then((back) => {
                showToast(back.ok ? back.message : back.error, back.ok ? "default" : "error");
                router.refresh();
              }),
          });
        })
      }
    >
      {pending ? "מסיר…" : "הסרה"}
    </button>
  );
}
