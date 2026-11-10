"use client";

import { PriceNote } from "./price-note";
import { Check, ChevronDown, Share2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { sendEmailLink, setUpTeam, signInWithGoogle } from "@/app/auth/actions";
import { sendQuoteRequest, type SendState } from "@/app/cart/actions";
import type { TeamNameResponse } from "@/app/api/team-name/route";
import { groupBySupplier, type CartChange } from "@/domain/cart";
import { encodeCart } from "@/domain/cart-share";
import { formatIls } from "@/domain/pricing";
import { business } from "@/lib/business";
import { flushCartWrites, removeNow } from "./cart-actions";
import { cartSnapshot, cartTotals, markBlocked, replaceLines, setMergeSkipped, useCart, type CartSheetLine, type Checkout } from "./cart-store";
import { Ltr } from "./ltr";
import { QtyStepper } from "./qty-stepper";
import { showToast } from "./toast";

const VAT = 0.18;
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Asia/Jerusalem" });

function thumb(src: string) {
  return src.startsWith("https://cdn.shopify.com/") ? `${src}${src.includes("?") ? "&" : "?"}width=120` : src;
}

const primary =
  "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60";
const field = "h-11 w-full rounded-xl bg-subtle px-4 text-[15px] outline-none focus:ring-2 focus:ring-brand";

/** "X: היה 2, עכשיו 3, Y נוסף (1), Z הוסר" for the stale-cart message (words, since arrows flip next to English titles). */
function describeChanges(changes: CartChange[], lines: CartSheetLine[]) {
  const title = (id: string) => lines.find((l) => l.variantId === id)?.title ?? "פריט";
  return changes
    .slice(0, 5)
    .map((c) => (c.before === 0 ? `${title(c.variantId)} נוסף (${c.after})` : c.after === 0 ? `${title(c.variantId)} הוסר` : `${title(c.variantId)}: היה ${c.before}, עכשיו ${c.after}`))
    .join(", ")
    .concat(changes.length > 5 ? ` ועוד ${changes.length - 5}` : "");
}

/** A server error, right above the button that caused it (the toast repeats it). */
function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-caption font-medium text-danger">
      {message}
    </p>
  );
}

/** A cart line that a sideways swipe removes (with Undo), as on a phone's mail app. */
function SwipeLine({ line, onNavigate }: { line: CartSheetLine; onNavigate?: () => void }) {
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);
  return (
    <li
      className="relative touch-pan-y overflow-hidden border-b border-line last:border-b-0"
      onPointerDown={(e) => {
        if (e.pointerType === "touch") start.current = e.clientX;
      }}
      onPointerMove={(e) => {
        if (start.current !== null) setDx(e.clientX - start.current);
      }}
      onPointerUp={() => {
        if (start.current !== null && Math.abs(dx) > 90) removeNow(line.variantId);
        start.current = null;
        setDx(0);
      }}
      onPointerCancel={() => {
        start.current = null;
        setDx(0);
      }}
    >
      <div className="absolute inset-0 flex items-center justify-end bg-danger px-6 text-caption font-medium text-white" aria-hidden>
        הסרה
      </div>
      <div className="relative flex gap-3 bg-surface py-4 transition-transform duration-150" style={{ transform: `translateX(${dx}px)` }}>
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tile">
          {line.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb(line.image)} alt={line.title} referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Link href={line.href} onClick={onNavigate} className="hover:text-brand">
            <Ltr className="line-clamp-2 text-start text-[15px] font-medium">{line.title}</Ltr>
          </Link>
          <span className="truncate text-caption text-muted">
            <Ltr>{[line.options, line.sku].filter(Boolean).join(", ")}</Ltr>
          </span>
          {line.orderable === false ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption font-medium text-danger">לא ניתן להזמין עוד</span>
              <button
                type="button"
                onClick={() => removeNow(line.variantId)}
                className="flex h-11 items-center gap-1.5 rounded-full bg-danger/10 px-4 text-caption font-semibold text-danger hover:bg-danger/15"
              >
                <Trash2 size={16} strokeWidth={1.75} aria-hidden />
                הסרה
              </button>
            </div>
          ) : (
            <>
              {line.available === false && line.checkedAt && (
                <span className="text-caption text-warning">לא זמין אצל הספק, נבדק {dayMonth.format(new Date(line.checkedAt))}</span>
              )}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <QtyStepper variantId={line.variantId} qty={line.qty} label={line.title} />
                  {line.qty > 1 && (
                    <button
                      type="button"
                      onClick={() => removeNow(line.variantId)}
                      aria-label={`הסרה מהסל: ${line.title}`}
                      className="flex size-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={18} strokeWidth={1.75} aria-hidden />
                    </button>
                  )}
                </div>
                <span className="flex flex-col items-end text-[15px] font-semibold tabular-nums">
                  {line.unitPriceIls === null ? <span className="text-caption font-normal text-muted">אין מחיר</span> : formatIls(line.unitPriceIls * line.qty)}
                  {line.unitPriceIls !== null && line.qty > 1 && <span className="text-caption font-normal text-muted">{formatIls(line.unitPriceIls)} ליח׳</span>}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * One tap for anyone on the team (D11): delivery and contact are remembered, and
 * change only on request.
 */
function TeamSend({
  checkout,
  isNew,
  blockedCount,
  onSent,
}: {
  checkout: Checkout;
  isNew: boolean;
  blockedCount: number;
  onSent: (n: { orderId: string; number: number }) => void;
}) {
  const [editing, setEditing] = useState(!checkout.contactName || !checkout.contactPhone);
  const [changes, setChanges] = useState<Checkout & { notes: string }>({ ...checkout, notes: "" });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    startTransition(async () => {
      // Waiting quantity changes go first, so the server compares against the cart as shown.
      await flushCartWrites();
      const shown = cartSnapshot().lines;
      const result = await sendQuoteRequest(
        changes,
        shown.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      ).catch(() => ({ error: "אין חיבור לשרת. נסו שוב בעוד רגע." }) as SendState);
      if (result.orderId && result.number) onSent({ orderId: result.orderId, number: result.number });
      else {
        setErrors(result.fieldErrors ?? {});
        if (result.fieldErrors) setEditing(true);
        if (result.blocked?.length) markBlocked(result.blocked);
        let message = result.error ?? "השליחה נכשלה";
        if (result.changed && result.lines) {
          replaceLines(result.lines);
          message = `${message} ${describeChanges(result.changed, [...shown, ...result.lines])}`;
        }
        setError(message);
        showToast(result.error ?? "השליחה נכשלה", "error");
      }
    });
  }

  const summary = [
    changes.deliveryMethod === "ship" ? `משלוח ל${changes.address || "…"}` : "איסוף עצמי",
    changes.contactName,
    changes.contactPhone,
  ]
    .filter(Boolean)
    .join(", ");
  const err = (k: string) => errors[k]?.map((e) => <span key={e} className="text-caption text-danger">{e}</span>);

  return (
    <div className="flex flex-col gap-3">
      {isNew && <p className="rounded-xl bg-subtle p-3 text-caption">קבוצה חדשה: הספק הישראלי יאשר את הקבוצה יחד עם הבקשה הראשונה.</p>}
      {editing ? (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2" role="group" aria-label="מסירה">
            {(["pickup", "ship"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={changes.deliveryMethod === m}
                onClick={() => setChanges({ ...changes, deliveryMethod: m })}
                className={`h-11 flex-1 rounded-full text-[15px] ${changes.deliveryMethod === m ? "bg-foreground text-background" : "bg-subtle"}`}
              >
                {m === "pickup" ? "איסוף עצמי" : "משלוח לקבוצה"}
              </button>
            ))}
          </div>
          {changes.deliveryMethod === "ship" && (
            <>
              <input className={field} placeholder="כתובת למשלוח" aria-label="כתובת למשלוח" value={changes.address} onChange={(e) => setChanges({ ...changes, address: e.target.value })} />
              {err("address")}
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input className={field} placeholder="איש/אשת קשר" aria-label="איש קשר" value={changes.contactName} onChange={(e) => setChanges({ ...changes, contactName: e.target.value })} />
            <input className={field} placeholder="טלפון" aria-label="טלפון" dir="ltr" inputMode="tel" value={changes.contactPhone} onChange={(e) => setChanges({ ...changes, contactPhone: e.target.value })} />
          </div>
          {err("contactName")}
          {err("contactPhone")}
          <textarea className="rounded-xl bg-subtle p-3 text-[15px] outline-none focus:ring-2 focus:ring-brand" rows={2} placeholder="הערות לספק הישראלי (לא חובה)" aria-label="הערות" value={changes.notes} onChange={(e) => setChanges({ ...changes, notes: e.target.value })} />
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-subtle px-4 text-start text-caption">
          <span className="truncate">{summary}</span>
          <span className="shrink-0 text-brand">שינוי</span>
        </button>
      )}
      <InlineError message={error} />
      <button type="button" onClick={send} disabled={pending || blockedCount > 0} className={primary}>
        {pending ? "שולח…" : "שליחת בקשה להצעת מחיר"}
      </button>
    </div>
  );
}

/** A guest's "send": an email link signs them in (Google too, once it's switched on); the cart waits. */
export function SignInStep({ google, next: to, intro = "כדי לשלוח צריך חשבון קבוצה. אין סיסמה: נשלח לכם קישור כניסה." }: { google: boolean; next?: string; intro?: string }) {
  const pathname = usePathname();
  const next = to ?? `${pathname}?cart=open`;
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-subtle p-4 text-[15px]">
        <span className="flex items-center gap-2 font-semibold">
          <Check size={18} aria-hidden /> שלחנו קישור כניסה
        </span>
        <span className="text-caption text-muted">
          פתחו את הקישור שנשלח ל-<Ltr>{sent}</Ltr> בדפדפן הזה. הסל שלכם יחכה כאן, ואחרי הכניסה נשאר רק לשלוח.
        </span>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await sendEmailLink(email, next).catch(() => ({ sent: undefined, error: "אין חיבור לשרת. נסו שוב בעוד רגע." }));
          if (result.sent) setSent(result.sent);
          else {
            setError(result.error ?? "השליחה נכשלה");
            showToast(result.error ?? "השליחה נכשלה", "error");
          }
        });
      }}
    >
      <p className="text-caption text-muted">{intro}</p>
      <input className={field} type="email" required dir="ltr" autoComplete="email" placeholder="you@team.org" aria-label="דוא״ל" value={email} onChange={(e) => setEmail(e.target.value)} />
      <InlineError message={error} />
      <button disabled={pending} className={primary}>
        {pending ? "שולח…" : "שליחת קישור כניסה"}
      </button>
      {google && (
        <button
          type="button"
          onClick={() => startTransition(() => signInWithGoogle(next))}
          className="flex h-11 w-full items-center justify-center rounded-full bg-surface text-[15px] font-medium shadow-[inset_0_0_0_1px_var(--line)] hover:bg-subtle"
        >
          המשך עם Google
        </button>
      )}
    </form>
  );
}

/** Signed in without a team: create it (pending approval) with this user's email on its account. */
export function TeamStep() {
  const [program, setProgram] = useState<"FRC" | "FTC">("FRC");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function lookUp(n: string, p = program) {
    setRegistered(false);
    if (!/^\d{1,6}$/.test(n)) return;
    const res = (await (await fetch(`/api/team-name?program=${p}&number=${n}`)).json()) as TeamNameResponse;
    setRegistered(res.registered);
    if (res.name && !name) setName(res.name);
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setUpTeam({ program, number, name }).catch(() => ({ error: "אין חיבור לשרת. נסו שוב בעוד רגע." }));
          if (result?.error) {
            setError(result.error);
            showToast(result.error, "error");
          }
        });
      }}
    >
      <p className="text-caption text-muted">עוד צעד אחד: איזו קבוצה אתם?</p>
      <div className="flex gap-2" role="group" aria-label="תחום">
        {(["FRC", "FTC"] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={program === p}
            onClick={() => {
              setProgram(p);
              void lookUp(number, p);
            }}
            className={`h-11 flex-1 rounded-full text-[15px] ${program === p ? "bg-foreground text-background" : "bg-subtle"}`}
          >
            <Ltr>{p}</Ltr>
          </button>
        ))}
      </div>
      <input
        className={field}
        inputMode="numeric"
        dir="ltr"
        required
        placeholder="מספר קבוצה"
        aria-label="מספר קבוצה"
        value={number}
        onChange={(e) => {
          setNumber(e.target.value);
          void lookUp(e.target.value);
        }}
      />
      {registered ? (
        <p className="text-caption text-warning">קבוצה רשומה כבר: בקשו ממי שרשם/ה אותה להוסיף את הכתובת שלכם.</p>
      ) : (
        <input className={field} required placeholder="שם הקבוצה" aria-label="שם הקבוצה" value={name} onChange={(e) => setName(e.target.value)} />
      )}
      <InlineError message={error} />
      <button disabled={pending || registered} className={primary}>
        {pending ? "יוצר…" : "יצירת הקבוצה"}
      </button>
    </form>
  );
}

/** Parts from the cart built before sign-in that couldn't join the team's cart, named until dismissed. */
function MergeSkipped({ titles }: { titles?: string[] }) {
  if (!titles?.length) return null;
  return (
    <div role="status" className="flex items-start justify-between gap-2 rounded-xl bg-warning/10 p-3 text-caption">
      <span>
        מהסל שבניתם לפני הכניסה לא נוספו, כי כבר לא ניתן להזמין אותם: <Ltr>{titles.join(", ")}</Ltr>
      </span>
      <button type="button" onClick={() => setMergeSkipped(undefined)} className="-m-2 flex min-h-11 shrink-0 items-center px-2 font-medium text-brand">
        הבנתי
      </button>
    </div>
  );
}

/**
 * Pinned to the bottom of the sheet (or page): total, one status line and the
 * primary action, so Send is in reach however long the cart is. Its height is
 * published as --sheet-footer on the sheet so toasts sit above it.
 */
function CartFooter({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const sheet = el?.closest("dialog");
    if (!el || !sheet) return;
    const observer = new ResizeObserver(() => sheet.style.setProperty("--sheet-footer", `${el.offsetHeight}px`));
    observer.observe(el);
    return () => {
      observer.disconnect();
      sheet.style.removeProperty("--sheet-footer");
    };
  }, []);
  return (
    <div
      ref={ref}
      className="sticky bottom-0 z-10 -mx-6 flex max-h-[70dvh] shrink-0 flex-col gap-3 overflow-y-auto border-t border-line bg-surface px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      {children}
    </div>
  );
}

/**
 * The cart and its checkout, in one place: the lines, the cost,
 * sharing, and the one primary action for whoever is looking (a guest signs in,
 * someone signed in to a team sends).
 */
export function CartPanel({ onNavigate, onContinue }: { onNavigate?: () => void; onContinue?: () => void }) {
  const cart = useCart();
  const { lines, mode } = cart;
  const { count, totalIls } = cartTotals(lines);
  const [costOpen, setCostOpen] = useState(false);
  const [sent, setSent] = useState<{ orderId: string; number: number } | null>(null);
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/cart/shared?items=${encodeCart(lines)}`;
  const blocked = lines.filter((l) => l.orderable === false);
  const unavailable = lines.filter((l) => l.orderable !== false && l.available === false);

  // Phones get the system share sheet (WhatsApp is one tap away); elsewhere the link is copied.
  async function share() {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "סל ב-COTS-IL", url: shareUrl });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("הקישור לסל הועתק");
    } catch {
      showToast("לא הצלחנו להעתיק", "error");
    }
  }

  function sentNow(order: { orderId: string; number: number }) {
    replaceLines([]);
    setSent(order);
  }

  // Until the cart gains lines again (or the sheet closes, which remounts this panel).
  if (sent && lines.length === 0) {
    const days = business.quoteLeadBusinessDays;
    return (
      <div className="flex flex-col items-center gap-3 px-2 py-10 text-center" role="status">
        <span className="flex size-12 items-center justify-center rounded-full bg-success text-white">
          <Check size={24} aria-hidden />
        </span>
        <h3 className="text-section font-semibold">
          בקשה מס׳ <Ltr>{sent.number}</Ltr> נשלחה
        </h3>
        <p className="text-muted">
          הספק הישראלי יבדוק זמינות ומחירים וישלח הצעת מחיר לאישור הקבוצה{days ? ` תוך ${days} ימי עסקים` : ""}. נעדכן במייל.
        </p>
        <div className="flex w-full flex-col gap-2 pt-2">
          <Link href={`/orders/${sent.orderId}`} onClick={onNavigate} className={primary}>
            לצפייה בבקשה
          </Link>
          {onContinue ? (
            <button type="button" onClick={onContinue} className="flex h-11 items-center justify-center rounded-full text-[15px] font-medium text-brand hover:bg-subtle">
              המשך קנייה
            </button>
          ) : (
            <Link href="/catalog" className="flex h-11 items-center justify-center rounded-full text-[15px] font-medium text-brand hover:bg-subtle">
              המשך קנייה
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <MergeSkipped titles={cart.mergeSkipped} />
        <p className="text-section font-semibold">הסל ריק</p>
        <Link
          href="/catalog"
          onClick={onNavigate}
          className="flex h-11 items-center rounded-full border border-line bg-white/90 px-5 text-[15px] font-medium text-brand shadow-2xs transition-colors hover:border-brand/40 hover:bg-subtle"
        >
          לקטלוג
        </Link>
      </div>
    );
  }

  const status =
    blocked.length > 0
      ? {
          tone: "text-danger",
          text:
            blocked.length === 1
              ? "פריט אחד בסל כבר לא ניתן להזמנה: הסירו אותו כדי לשלוח."
              : `${blocked.length} פריטים בסל כבר לא ניתנים להזמנה: הסירו אותם כדי לשלוח.`,
        }
      : unavailable.length > 0
        ? {
            tone: "text-warning",
            text:
              unavailable.length === 1
                ? "פריט אחד לא זמין כרגע אצל הספק. אפשר לשלוח, ונבדוק בהצעה."
                : `${unavailable.length} פריטים לא זמינים כרגע אצל הספק. אפשר לשלוח, ונבדוק בהצעה.`,
          }
        : { tone: "text-muted", text: "זו בקשה ולא הזמנה: הספק הישראלי יבדוק זמינות ומחירים ויחזור עם הצעת מחיר לאישורכם." };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col gap-4 pb-4">
        <MergeSkipped titles={cart.mergeSkipped} />
        {groupBySupplier(lines).map((group) => (
          <section key={group.supplierName} aria-label={group.supplierName}>
            <h3 className="pt-2 text-caption font-semibold text-muted">
              <Ltr>{group.supplierName}</Ltr>
            </h3>
            <ul>
              {group.lines.map((line) => (
                <SwipeLine key={line.variantId} line={line} onNavigate={onNavigate} />
              ))}
            </ul>
          </section>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={share} className="flex min-h-11 items-center gap-2 rounded-full bg-subtle px-4 text-caption">
            <Share2 size={16} aria-hidden />
            שיתוף הסל
          </button>
        </div>
      </div>

      <CartFooter>
        <button type="button" onClick={() => setCostOpen((o) => !o)} aria-expanded={costOpen} className="flex min-h-11 items-center justify-between gap-2 text-start">
          <span className="flex items-center gap-1 text-muted">
            סה״כ משוער, כולל מע״מ
            <ChevronDown size={14} aria-hidden className={`transition-transform ${costOpen ? "rotate-180" : ""}`} />
          </span>
          <span className="text-section font-semibold tabular-nums">{formatIls(totalIls)}</span>
        </button>
        {costOpen && (
          <dl className="flex flex-col gap-1 rounded-xl bg-subtle p-3 text-caption">
            <div className="flex justify-between">
              <dt>{count} פריטים</dt>
              <dd className="tabular-nums">{formatIls(totalIls)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>מתוכם מע״מ</dt>
              <dd className="tabular-nums">{formatIls(Math.round(totalIls - totalIls / (1 + VAT)))}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>משלוח בישראל</dt>
              <dd>יתומחר בהצעה</dd>
            </div>
          </dl>
        )}
        <p className={`text-caption ${status.tone}`}>{status.text}</p>

        {mode === "guest" && <SignInStep google={!!cart.googleSignIn} />}
        {mode === "noteam" && <TeamStep />}
        {mode === "ordering" && cart.team && cart.checkout && (
          <TeamSend checkout={cart.checkout} isNew={cart.team.status === "pending"} blockedCount={blocked.length} onSent={sentNow} />
        )}
        <PriceNote />
      </CartFooter>
    </div>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="סגירה" className="-me-3 flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground">
      <X size={20} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
