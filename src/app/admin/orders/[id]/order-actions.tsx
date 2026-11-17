"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis, Search } from "lucide-react";
import type { ActionState } from "@/components/action-form";
import { Alert, Button, StatusTag } from "@/components/form";
import { showToast } from "@/components/toast";
import { formatIls } from "@/domain/pricing";
import { rejectOrder, type QuoteFormState } from "../actions";
import {
  adminCancelOrder,
  deleteOrder,
  findReplacements,
  moveOrder,
  reopenOrder,
  replaceItem,
  setItemUnavailable,
  setPoLineUnavailable,
  type CancelResult,
  type Replacement,
} from "../corrections";

const inputClass = "h-11 min-w-0 rounded-full border border-line bg-surface px-3 text-base";
const menuButton = "min-h-11 rounded-full bg-subtle px-4 text-sm font-medium hover:bg-subtle-hover disabled:opacity-60";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <span className="text-sm font-medium">{title}</span>
      {children}
    </div>
  );
}

function RejectForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(rejectOrder, {} as QuoteFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="orderId" value={orderId} />
      <input name="reason" aria-label="סיבת הדחייה" placeholder="סיבת הדחייה (הקבוצה תראה אותה)" required minLength={2} maxLength={1000} className={inputClass} />
      <button disabled={pending} className={`${menuButton} text-danger`}>
        {pending ? "דוחה…" : "דחיית ההזמנה"}
      </button>
    </form>
  );
}

function CancelForm({ orderId, warnings, blocked }: { orderId: string; warnings: string[]; blocked: string | null }) {
  const [, start] = useTransition();
  const [state, action, pending] = useActionState(async (prev: CancelResult, data: FormData) => {
    const result = await adminCancelOrder(prev, data);
    if (!result.error)
      showToast("ההזמנה בוטלה", "default", {
        label: "החזרה",
        run: () =>
          start(async () => {
            const form = new FormData();
            form.set("orderId", orderId);
            const undone = await reopenOrder({}, form);
            if (undone.error) showToast(undone.error, "error");
          }),
      });
    return result;
  }, {} as CancelResult);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error && <Alert>{state.error}</Alert>}
      {blocked ? (
        <p className="text-caption text-warning">{blocked}</p>
      ) : (
        warnings.length > 0 && (
          <ul className="flex list-disc flex-col gap-1 ps-5 text-caption text-warning">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )
      )}
      <input type="hidden" name="orderId" value={orderId} />
      <input name="reason" aria-label="סיבת הביטול" placeholder="סיבת הביטול (הקבוצה תראה אותה)" required minLength={2} maxLength={1000} className={inputClass} />
      <button disabled={pending || !!blocked} className={`${menuButton} text-danger`}>
        {pending ? "מבטל…" : "ביטול ההזמנה"}
      </button>
    </form>
  );
}

function MoveForm({ orderId, teams }: { orderId: string; teams: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState(moveOrder, {} as ActionState);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error && <Alert>{state.error}</Alert>}
      {state.ok && <p role="status" className="text-caption text-success">{state.ok}</p>}
      <input type="hidden" name="orderId" value={orderId} />
      <select name="teamId" required aria-label="הקבוצה החדשה" defaultValue="" className={inputClass}>
        <option value="" disabled>
          בחירת קבוצה
        </option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
      <button disabled={pending} className={menuButton}>
        {pending ? "מעביר…" : "העברת ההזמנה"}
      </button>
    </form>
  );
}

/**
 * Deleting for good, at any stage. It can't be taken back, so this is the one place with a
 * confirm step: it names the order and says what happens to its supplier orders and stock.
 */
function DeleteOrder({ orderId, orderNumber, warnings }: { orderId: string; orderNumber: number; warnings: string[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(async (prev: ActionState, data: FormData) => {
    const result = await deleteOrder(prev, data);
    if (result.ok) {
      showToast(result.ok);
      router.replace("/admin");
    }
    return result;
  }, {} as ActionState);
  if (!confirming)
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${menuButton} text-danger`}>
        מחיקת ההזמנה
      </button>
    );
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl bg-danger/5 p-3 ring-1 ring-danger/30 ring-inset">
      {state.error && <Alert>{state.error}</Alert>}
      <p className="text-sm font-semibold text-danger">למחוק את הזמנה {orderNumber} לצמיתות?</p>
      <p className="text-caption">ההזמנה, השורות, ההצעות והקישורים לאישור, ההיסטוריה וההתראות שלה יימחקו. אי אפשר לבטל את זה. ביומן הפעולות נשמר רק סיכום.</p>
      {warnings.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 ps-5 text-caption text-warning">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <input type="hidden" name="orderId" value={orderId} />
      <input name="reason" aria-label="סיבת המחיקה (לא חובה)" placeholder="סיבת המחיקה (לא חובה)" maxLength={1000} className={inputClass} />
      <div className="flex flex-wrap gap-2">
        <button disabled={pending} className={`${menuButton} bg-danger text-white hover:bg-danger`}>
          {pending ? "מוחק…" : "מחיקה לצמיתות"}
        </button>
        <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={menuButton}>
          ביטול
        </button>
      </div>
    </form>
  );
}

/**
 * "…" next to the order: the rare corrections (M2), so none sits beside the stage's main
 * button. Each one that can't be taken back needs a typed reason instead of a confirm dialog.
 */
export function OrderMenu(props: {
  orderId: string;
  canReject: boolean;
  canCancel: boolean;
  cancelWarnings: string[];
  cancelBlocked: string | null;
  teams: { id: string; label: string }[];
  orderNumber: number;
  deleteWarnings: string[];
}) {
  return (
    <details className="group relative self-end">
      <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-full hover:bg-subtle [&::-webkit-details-marker]:hidden" aria-label="פעולות נוספות">
        <Ellipsis size={20} aria-hidden />
      </summary>
      <div className="absolute end-0 z-10 mt-1 flex max-h-[70vh] w-[min(22rem,calc(100vw-3rem))] flex-col gap-3 overflow-y-auto rounded-[18px] border border-line bg-surface p-3 shadow-lift">
        {props.canReject && (
          <Group title="דחיית ההזמנה">
            <RejectForm orderId={props.orderId} />
          </Group>
        )}
        {props.canCancel && (
          <Group title="ביטול ההזמנה">
            <CancelForm orderId={props.orderId} warnings={props.cancelWarnings} blocked={props.cancelBlocked} />
          </Group>
        )}
        {props.teams.length > 0 && (
          <Group title="העברה לקבוצה אחרת">
            <MoveForm orderId={props.orderId} teams={props.teams} />
          </Group>
        )}
        <Group title="מחיקה לצמיתות">
          <DeleteOrder orderId={props.orderId} orderNumber={props.orderNumber} warnings={props.deleteWarnings} />
        </Group>
      </div>
    </details>
  );
}

/** Brings a rejected or cancelled order back to where it stopped. */
export function ReopenOrder({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(reopenOrder, {} as ActionState);
  return (
    <form action={action} className="flex flex-col gap-2">
      {state.error && <Alert>{state.error}</Alert>}
      <input type="hidden" name="orderId" value={orderId} />
      <Button variant="secondary" disabled={pending} className="self-start">
        {pending ? "פותח…" : "פתיחה מחדש"}
      </Button>
    </form>
  );
}

function UnavailableToggle({ unavailable, toggle, label }: { unavailable: boolean; toggle: (next: boolean) => Promise<{ error?: string }>; label: string }) {
  const [pending, start] = useTransition();
  const run = (next: boolean) =>
    start(async () => {
      const result = await toggle(next);
      if (result.error) return showToast(result.error, "error");
      showToast(next ? `${label} סומן ״לא זמין״` : `הסימון ״לא זמין״ הוסר מ${label}`, "default", {
        label: "ביטול",
        run: () =>
          start(async () => {
            const undone = await toggle(!next);
            if (undone.error) showToast(undone.error, "error");
          }),
      });
    });
  return (
    <button type="button" disabled={pending} onClick={() => run(!unavailable)} className={`${menuButton} text-caption`}>
      {unavailable ? "זמין שוב" : "לא זמין"}
    </button>
  );
}

/** The "לא זמין" mark on an order line, and "replace with another part". */
export function LineTools({ itemId, label, unavailable, canReplace }: { itemId: string; label: string; unavailable: boolean; canReplace: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {unavailable && <StatusTag tone="danger">לא זמין</StatusTag>}
        <UnavailableToggle unavailable={unavailable} label={label} toggle={(next) => setItemUnavailable(itemId, next)} />
        {canReplace && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`${menuButton} text-caption`}>
            החלפה בפריט אחר
          </button>
        )}
      </div>
      {open && <ReplacePicker itemId={itemId} onDone={() => setOpen(false)} />}
    </div>
  );
}

function ReplacePicker({ itemId, onDone }: { itemId: string; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Replacement[] | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const search = () =>
    start(async () => {
      setError(null);
      setResults(await findReplacements(query));
    });
  const pick = (variantId: string) =>
    start(async () => {
      const result = await replaceItem(itemId, variantId);
      if (result.error) return setError(result.error);
      showToast(result.version ? `הפריט הוחלף. גרסה ${result.version} של ההצעה נשלחה לאישור הקבוצה.` : "הפריט הוחלף.");
      onDone();
    });

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-subtle p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          dir="ltr"
          aria-label="מק״ט או שם הפריט החדש"
          placeholder="SKU / name"
          className={`${inputClass} flex-1 basis-40`}
        />
        <Button variant="secondary" disabled={pending || query.trim().length < 2}>
          <Search size={20} aria-hidden /> חיפוש
        </Button>
      </form>
      {error && <Alert>{error}</Alert>}
      {results && results.length === 0 && <p className="text-caption text-muted">לא נמצא פריט. אפשר לנסות מק״ט אחר.</p>}
      {results && results.length > 0 && (
        <ul className="flex flex-col">
          {results.map((r) => (
            <li key={r.variantId} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 first:border-t-0">
              <div dir="ltr" className="min-w-0 text-start text-sm">
                <div className="font-medium">{r.title}</div>
                <div className="text-caption text-muted">
                  {[r.supplierName, r.supplierSku, r.options.map((o) => o.value).join(" / ")].filter(Boolean).join(", ")}
                </div>
              </div>
              <span className="flex items-center gap-2 text-caption">
                {r.priceIls !== null && <span className="tabular-nums">{formatIls(r.priceIls)}</span>}
                {r.available === false && <StatusTag tone="warning">לא במלאי</StatusTag>}
                <button type="button" disabled={pending} onClick={() => pick(r.variantId)} className={`${menuButton} text-caption`}>
                  בחירה
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The mark from a supplier order's line: every open team order on it gets it. */
export function PoLineUnavailable({ poLineId, unavailable, label }: { poLineId: string; unavailable: boolean; label: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 print:hidden" dir="rtl">
      {unavailable && <StatusTag tone="danger">לא זמין</StatusTag>}
      <UnavailableToggle unavailable={unavailable} label={label} toggle={(next) => setPoLineUnavailable(poLineId, next)} />
    </span>
  );
}
