"use client";

import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { useRef, useTransition } from "react";
import { setCartQty } from "@/app/cart/actions";
import { formatIls } from "@/domain/pricing";
import { cartTotals, setQtyOptimistic, useCart, type CartSheetLine } from "./cart-store";
import { Ltr } from "./ltr";

function thumb(src: string) {
  return src.startsWith("https://cdn.shopify.com/") ? `${src}${src.includes("?") ? "&" : "?"}width=120` : src;
}

function Stepper({ line }: { line: CartSheetLine }) {
  const [, startTransition] = useTransition();

  function change(qty: number) {
    if (qty < 1 || qty > 9999) return;
    setQtyOptimistic(line.variantId, qty);
    startTransition(() => setCartQty(line.variantId, qty));
  }

  const button = "flex size-11 items-center justify-center rounded-full text-foreground transition-transform active:scale-90 disabled:opacity-30";
  return (
    <div className="flex items-center rounded-full bg-subtle">
      <button type="button" className={button} onClick={() => change(line.qty - 1)} disabled={line.qty <= 1} aria-label="הפחתה">
        <Minus size={16} strokeWidth={2} aria-hidden />
      </button>
      <span className="min-w-6 text-center text-[15px] font-medium tabular-nums" aria-live="polite">
        {line.qty}
      </span>
      <button type="button" className={button} onClick={() => change(line.qty + 1)} aria-label="הוספה">
        <Plus size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

/**
 * The cart, always under the thumb: a pill with the count and ₪ total that opens
 * the cart as a sheet. Sending the request still happens on /cart for now.
 */
export function CartPill() {
  const { mode, lines } = useCart();
  const sheet = useRef<HTMLDialogElement>(null);
  const { count, totalIls } = cartTotals(lines);

  if (mode !== "ordering" || count === 0) return null;

  const close = () => sheet.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => sheet.current?.showModal()}
        className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto flex h-12 w-max items-center gap-3 rounded-full bg-foreground ps-5 pe-6 text-background shadow-lift transition-transform duration-300 ease-spring starting:scale-75 active:scale-95 md:inset-x-auto md:end-8 md:bottom-8 md:mx-0 print:hidden"
      >
        <ShoppingBag size={20} strokeWidth={1.75} aria-hidden />
        <span className="text-[15px] font-medium">
          סל · <span className="tabular-nums">{count}</span>
        </span>
        <span className="h-4 w-px bg-current opacity-30" aria-hidden />
        <span className="text-[15px] font-semibold tabular-nums">{formatIls(totalIls)}</span>
      </button>

      <dialog
        ref={sheet}
        aria-label="הסל"
        className="sheet sheet-side"
        onClick={(e) => e.target === sheet.current && close()}
      >
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-center justify-between border-b border-line px-6 py-3">
            <h2 className="text-section font-semibold">הסל</h2>
            <button
              type="button"
              onClick={close}
              aria-label="סגירה"
              className="-me-3 flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground"
            >
              <X size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </div>

          <ul className="flex-1 overflow-y-auto px-6">
            {lines.map((line) => (
              <li key={line.variantId} className="flex gap-3 border-b border-line py-4 last:border-b-0">
                <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tile">
                  {line.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb(line.image)} alt={line.title} referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Link href={line.href} onClick={close} className="hover:text-brand">
                    <Ltr className="line-clamp-2 text-start text-[15px] font-medium">{line.title}</Ltr>
                  </Link>
                  <span className="truncate text-caption text-muted">
                    <Ltr>{line.supplierName}</Ltr>
                    {line.options && (
                      <>
                        {" · "}
                        <Ltr>{line.options}</Ltr>
                      </>
                    )}
                    {line.sku && (
                      <>
                        {" · "}
                        <Ltr className="font-mono">{line.sku}</Ltr>
                      </>
                    )}
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <Stepper line={line} />
                    <span className="text-[15px] font-semibold">
                      {line.unitPriceIls === null ? (
                        <span className="text-caption font-normal text-muted">ייבדק בהצעה</span>
                      ) : (
                        <span className="tabular-nums">{formatIls(line.unitPriceIls * line.qty)}</span>
                      )}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-3 border-t border-line px-6 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="flex items-baseline justify-between">
              <span className="text-muted">סה״כ משוער, כולל מע״מ</span>
              <span className="text-section font-semibold tabular-nums">{formatIls(totalIls)}</span>
            </div>
            <p className="text-caption text-muted">משלוח בישראל מתומחר בהצעת המחיר.</p>
            <Link
              href="/cart"
              onClick={close}
              className="flex h-11 items-center justify-center rounded-full bg-brand font-medium text-white transition-colors hover:bg-brand-strong"
            >
              המשך לשליחת בקשה להצעת מחיר
            </Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
