"use client";

import { Check, ChevronDown, ClipboardPaste, MessageCircle, Share2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { sendEmailLink, setUpTeam, signInWithGoogle } from "@/app/auth/actions";
import { lookupSkus, sendQuoteRequest, type SkuMatch } from "@/app/cart/actions";
import type { TeamNameResponse } from "@/app/api/team-name/route";
import { encodeCart, parsePastedList } from "@/domain/cart-share";
import { formatIls } from "@/domain/pricing";
import { addToCartNow, removeNow } from "./cart-actions";
import { cartTotals, useCart, type CartSheetLine, type Checkout } from "./cart-store";
import { Ltr } from "./ltr";
import { QtyStepper } from "./qty-stepper";
import { showToast } from "./toast";

const VAT = 0.18;

function thumb(src: string) {
  return src.startsWith("https://cdn.shopify.com/") ? `${src}${src.includes("?") ? "&" : "?"}width=120` : src;
}

const primary =
  "flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60";
const field = "h-11 w-full rounded-xl bg-subtle px-4 text-[15px] outline-none focus:ring-2 focus:ring-brand";

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
            <Ltr>{[line.supplierName, line.options, line.sku].filter(Boolean).join(" · ")}</Ltr>
          </span>
          <div className="flex items-center justify-between gap-2">
            <QtyStepper variantId={line.variantId} qty={line.qty} label={line.title} />
            <span className="text-[15px] font-semibold tabular-nums">
              {line.unitPriceIls === null ? <span className="text-caption font-normal text-muted">ייבדק בהצעה</span> : formatIls(line.unitPriceIls * line.qty)}
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

/** Paste a list of SKUs (or drop a BOM CSV) and add everything that's found, in one tap. */
function PasteList({ initial, onDone }: { initial?: string; onDone: () => void }) {
  const [text, setText] = useState(initial ?? "");
  const [matches, setMatches] = useState<SkuMatch[] | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function look(value = text) {
    const { lines, skipped } = parsePastedList(value);
    setSkipped(skipped);
    if (lines.length === 0) {
      setMatches([]);
      return;
    }
    startTransition(async () => setMatches(await lookupSkus(lines)));
  }

  const found = (matches ?? []).filter((m) => m.line);
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-subtle p-3">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMatches(null);
        }}
        rows={4}
        dir="ltr"
        placeholder={"WCP-0749, 4\nam-1594, 2\n3 x WCP-0543"}
        aria-label="רשימת מק״טים וכמויות"
        className="rounded-xl bg-surface p-3 font-mono text-caption outline-none focus:ring-2 focus:ring-brand"
      />
      {matches === null ? (
        <button type="button" onClick={() => look()} disabled={!text.trim() || pending} className={primary}>
          {pending ? "מחפש…" : "חיפוש המק״טים"}
        </button>
      ) : (
        <>
          <p className="text-caption text-muted">
            נמצאו {found.length} מתוך {matches.length}
            {matches.length - found.length > 0 && (
              <>
                {" "}· לא נמצאו: <Ltr className="font-mono">{matches.filter((m) => !m.line).map((m) => m.sku).join(", ")}</Ltr>
              </>
            )}
            {skipped.length > 0 && ` · ${skipped.length} שורות לא נקראו`}
          </p>
          {found.length > 0 && (
            <button
              type="button"
              className={primary}
              onClick={() => {
                for (const m of found) addToCartNow(m.line!, m.qty);
                showToast(`נוספו ${found.length} פריטים לסל`);
                setText("");
                setMatches(null);
                onDone();
              }}
            >
              הוספת כל {found.length} הפריטים
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** One tap for a returning mentor: delivery and contact are remembered, and change only on request. */
function MentorSend({ checkout, isNew, onSent }: { checkout: Checkout; isNew: boolean; onSent: (n: { orderId: string; number: number }) => void }) {
  const [editing, setEditing] = useState(!checkout.contactName || !checkout.contactPhone);
  const [changes, setChanges] = useState<Checkout & { notes: string }>({ ...checkout, notes: "" });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [pending, startTransition] = useTransition();

  function send() {
    startTransition(async () => {
      const result = await sendQuoteRequest(changes);
      if (result.orderId && result.number) onSent({ orderId: result.orderId, number: result.number });
      else {
        setErrors(result.fieldErrors ?? {});
        if (result.fieldErrors) setEditing(true);
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
    .join(" · ");
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
      <button type="button" onClick={send} disabled={pending} className={primary}>
        {pending ? "שולח…" : "שליחת בקשה להצעת מחיר"}
      </button>
      <p className="text-caption text-muted">זו בקשה ולא הזמנה: הספק הישראלי יבדוק זמינות ומחירים ויחזור עם הצעת מחיר לאישורכם.</p>
    </div>
  );
}

/** A guest's "send": an email link signs them in (Google too, once it's switched on); the cart waits. */
export function SignInStep({ google, next: to, intro = "כדי לשלוח צריך חשבון קבוצה. אין סיסמה: נשלח לכם קישור כניסה." }: { google: boolean; next?: string; intro?: string }) {
  const pathname = usePathname();
  const next = to ?? `${pathname}?cart=open`;
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
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
        startTransition(async () => {
          const result = await sendEmailLink(email, next);
          if (result.sent) setSent(result.sent);
          else showToast(result.error ?? "השליחה נכשלה", "error");
        });
      }}
    >
      <p className="text-caption text-muted">{intro}</p>
      <input className={field} type="email" required dir="ltr" autoComplete="email" placeholder="you@team.org" aria-label="דוא״ל" value={email} onChange={(e) => setEmail(e.target.value)} />
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

/** Signed in without a team: create it (pending approval) with this user as its mentor. */
export function TeamStep() {
  const [program, setProgram] = useState<"FRC" | "FTC">("FRC");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [registered, setRegistered] = useState(false);
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
        startTransition(async () => {
          const result = await setUpTeam({ program, number, name });
          if (result.error) showToast(result.error, "error");
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
        <p className="text-caption text-warning">הקבוצה כבר רשומה. בקשו מהמנטור/ית שלה הזמנה לכתובת שלכם.</p>
      ) : (
        <input className={field} required placeholder="שם הקבוצה" aria-label="שם הקבוצה" value={name} onChange={(e) => setName(e.target.value)} />
      )}
      <button disabled={pending || registered} className={primary}>
        {pending ? "יוצר…" : "יצירת הקבוצה"}
      </button>
    </form>
  );
}

/** A student's "send": the cart goes to the mentor, who sends it. */
function StudentSend({ shareUrl }: { shareUrl: string }) {
  const text = `הסל לרכש ציוד: ${shareUrl}`;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption text-muted">את הבקשה שולח/ת המנטור/ית. הסל משותף לכל הקבוצה, אז אפשר פשוט להודיע לו/ה:</p>
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" className={primary}>
        <MessageCircle size={18} aria-hidden />
        שליחה למנטור/ית בוואטסאפ
      </a>
    </div>
  );
}

/**
 * The cart and its checkout, in one place: the lines, pasting a list, the cost,
 * sharing, and the one primary action for whoever is looking (a guest signs in,
 * a mentor sends, a student passes it to the mentor).
 */
export function CartPanel({ onNavigate }: { onNavigate?: () => void }) {
  const cart = useCart();
  const { lines, mode } = cart;
  const { count, totalIls } = cartTotals(lines);
  const [pasting, setPasting] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [sent, setSent] = useState<{ orderId: string; number: number } | null>(null);
  const [dropped, setDropped] = useState<string | undefined>();
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/cart/shared?items=${encodeCart(lines)}`;

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("הקישור לסל הועתק");
    } catch {
      showToast("לא הצלחנו להעתיק", "error");
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success text-white">
          <Check size={24} aria-hidden />
        </span>
        <h3 className="text-section font-semibold">הבקשה נשלחה</h3>
        <p className="text-muted">
          בקשה מס׳ <Ltr>{sent.number}</Ltr>. הספק הישראלי יבדוק זמינות ומחירים וישלח הצעת מחיר לאישור המנטור/ית.
        </p>
        <Link href={`/orders/${sent.orderId}`} onClick={onNavigate} className="text-brand hover:underline">
          לצפייה בבקשה
        </Link>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        const file = e.dataTransfer.files[0];
        if (!file) return;
        e.preventDefault();
        setDropped(await file.text());
        setPasting(true);
      }}
    >
      {lines.length === 0 ? (
        <p className="py-6 text-center text-muted">הסל ריק. אפשר להדביק רשימת מק״טים או לגרור קובץ BOM לכאן.</p>
      ) : (
        <ul>
          {lines.map((line) => (
            <SwipeLine key={line.variantId} line={line} onNavigate={onNavigate} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setPasting((p) => !p)} aria-expanded={pasting} className="flex min-h-11 items-center gap-2 rounded-full bg-subtle px-4 text-caption">
          <ClipboardPaste size={16} aria-hidden />
          הדבקת רשימה או BOM
        </button>
        {lines.length > 0 && (
          <button type="button" onClick={copyShare} className="flex min-h-11 items-center gap-2 rounded-full bg-subtle px-4 text-caption">
            <Share2 size={16} aria-hidden />
            שיתוף הסל
          </button>
        )}
      </div>
      {pasting && <PasteList key={dropped} initial={dropped} onDone={() => setPasting(false)} />}

      {lines.length > 0 && (
        <>
          <button type="button" onClick={() => setCostOpen((o) => !o)} aria-expanded={costOpen} className="flex items-baseline justify-between gap-2 text-start">
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

          {mode === "guest" && <SignInStep google={!!cart.googleSignIn} />}
          {mode === "noteam" && <TeamStep />}
          {mode === "ordering" && cart.team?.isMentor && cart.checkout && (
            <MentorSend checkout={cart.checkout} isNew={cart.team.status === "pending"} onSent={setSent} />
          )}
          {mode === "ordering" && cart.team && !cart.team.isMentor && <StudentSend shareUrl={shareUrl} />}
        </>
      )}
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
