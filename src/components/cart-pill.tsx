"use client";

import { ShoppingBag, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatIls } from "@/domain/pricing";
import { cartTotals, useCart } from "./cart-store";
import { Ltr } from "./ltr";
import { QtyStepper } from "./qty-stepper";

function thumb(src: string) {
  return src.startsWith("https://cdn.shopify.com/") ? `${src}${src.includes("?") ? "&" : "?"}width=120` : src;
}

/**
 * The cart, always under the thumb: a pill with the count and ₪ total that opens
 * the cart as a sheet. Sending the request still happens on /cart for now.
 */
export function CartPill() {
  const { mode, lines } = useCart();
  const sheet = useRef<HTMLDialogElement>(null);
  const { count, totalIls } = cartTotals(lines);

  // Other parts of the page (the family page's buy bar on phones) open the sheet with this event.
  useEffect(() => {
    const open = () => sheet.current?.showModal();
    window.addEventListener("cart:open", open);
    return () => window.removeEventListener("cart:open", open);
  }, []);

  if (mode !== "ordering" || count === 0) return null;

  const close = () => sheet.current?.close();

  return (
    <>
      <button
        type="button"
        data-cart-pill
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
                    <QtyStepper variantId={line.variantId} qty={line.qty} label={line.title} />
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
