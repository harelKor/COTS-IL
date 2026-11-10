"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Alert } from "@/components/form";
import { markOrdersOrdered } from "./purchasing/actions";

/** Filters as you type: the URL follows a moment later, so a refresh or a shared link keeps it. */
export function InboxSearch({ q, base }: { q: string; base: string }) {
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function change(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const params = new URLSearchParams(base);
      if (next.trim()) params.set("q", next.trim());
      else params.delete("q");
      const s = params.toString();
      startTransition(() => router.replace(s ? `/admin?${s}` : "/admin", { scroll: false }));
    }, 250);
  }

  return (
    <label role="search" className="flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4">
      <Search size={18} aria-hidden className="text-muted" />
      <input
        type="search"
        value={value}
        onChange={(e) => change(e.target.value)}
        placeholder="קבוצה, מספר קבוצה או מספר הזמנה"
        aria-label="סינון לפי קבוצה, מספר קבוצה או מספר הזמנה"
        className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
      />
    </label>
  );
}

export const BULK_FORM = "bulk-ordered";

type Vendor = { id: string; name: string; orderIds: string[] };

/**
 * "סימון כהוזמן מ-<ספק>" for the orders ticked on their cards. The checkboxes sit in the
 * cards (form={BULK_FORM}), so this bar only listens for them.
 */
export function BulkOrdered({ vendors, today }: { vendors: Vendor[]; today: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [state, action, pending] = useActionState(async (prev: Awaited<ReturnType<typeof markOrdersOrdered>>, formData: FormData) => {
    const result = await markOrdersOrdered(prev, formData);
    if (result.done) {
      for (const box of document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM}"]`)) box.checked = false;
      setSelected([]);
    }
    return result;
  }, {});

  useEffect(() => {
    const read = () =>
      setSelected(
        [...document.querySelectorAll<HTMLInputElement>(`input[form="${BULK_FORM}"]:checked`)].map((i) => i.value),
      );
    read();
    document.addEventListener("change", read);
    return () => document.removeEventListener("change", read);
  }, []);

  const options = vendors.filter((v) => v.orderIds.some((id) => selected.includes(id)));
  const vendor = options.find((v) => v.id === supplierId) ?? options[0];
  const count = vendor ? selected.filter((id) => vendor.orderIds.includes(id)).length : 0;

  if (selected.length === 0) {
    return state.done ? <Alert tone="info">סומן כהוזמן ב-{state.done} הזמנות.</Alert> : null;
  }

  return (
    <form
      id={BULK_FORM}
      action={action}
      className="card-surface sticky bottom-4 z-10 flex flex-col gap-3 rounded-[18px] p-4 shadow-lift"
      aria-label="סימון מרוכז כהוזמן מהספק"
    >
      {state.error && <Alert>{state.error}</Alert>}
      <p className="text-sm font-medium">נבחרו {selected.length} הזמנות</p>
      {vendor ? (
        <>
          <div className="flex flex-wrap gap-2">
            {options.length > 1 && (
              <select
                name="supplierId"
                value={vendor.id}
                onChange={(e) => setSupplierId(e.target.value)}
                aria-label="ספק"
                className="h-11 rounded-full border border-line bg-surface px-4 text-base"
              >
                {options.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
            {options.length === 1 && <input type="hidden" name="supplierId" value={vendor.id} />}
            <input
              name="supplierOrderRef"
              required
              dir="ltr"
              placeholder="מספר הזמנה אצל הספק"
              aria-label="מספר הזמנה אצל הספק"
              className="h-11 min-w-0 flex-1 basis-40 rounded-full border border-line bg-surface px-4 text-base"
            />
            <input
              name="orderedAt"
              type="date"
              lang="he-IL"
              required
              defaultValue={today}
              aria-label="תאריך ההזמנה"
              className="h-11 rounded-full border border-line bg-surface px-4 text-base"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={pending} className="btn-brand min-h-11 rounded-full px-6 font-medium disabled:opacity-60">
              {pending ? "מסמן…" : <>סימון כהוזמן מ-<bdi>{vendor.name}</bdi></>}
            </button>
            <span className="text-sm text-muted">
              {count === selected.length ? `כל ${count} ההזמנות` : `${count} מתוך ${selected.length} ההזמנות`} מחכות לפריטים מהספק הזה
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">להזמנות שנבחרו אין פריטים שמחכים להזמנה מספק.</p>
      )}
    </form>
  );
}
