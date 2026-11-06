"use client";

import { ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatIls } from "@/domain/pricing";
import { CartPanel, CloseButton } from "./cart-panel";
import { canEditCart, cartTotals, useCart } from "./cart-store";

/** Opens the cart sheet from anywhere on the site. */
export const openCart = () => window.dispatchEvent(new Event("cart:open"));

/** Opens the cart sheet with the SKU/BOM paste box already open. */
export const openCartPaste = () => window.dispatchEvent(new Event("cart:open-paste"));

/**
 * The header's cart button, so the cart (and pasting a BOM) can be found while it's still empty.
 * Hidden for those who can't change a cart, such as the admin.
 */
export function CartButton() {
  const { mode, lines } = useCart();
  if (mode !== "loading" && !canEditCart(mode)) return null;
  const { count } = cartTotals(lines);
  return (
    <button
      type="button"
      onClick={openCart}
      aria-label={count > 0 ? `הסל, ${count} פריטים` : "הסל"}
      className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-white/90 shadow-2xs hover:bg-subtle text-foreground transition-colors"
    >
      <ShoppingBag size={20} strokeWidth={1.75} aria-hidden />
      {count > 0 && (
        <span className="absolute -end-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold text-white tabular-nums ring-2 ring-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/**
 * The cart, always under the thumb: a pill with the count and ₪ total that opens
 * the cart as a sheet, where the request is sent too. There's no checkout page.
 */
export function CartPill() {
  const { mode, lines } = useCart();
  const sheet = useRef<HTMLDialogElement>(null);
  const [wantOpen, setWantOpen] = useState<false | "cart" | "paste">(false);
  // Bumped by "cart:open-paste"; the panel opens its paste box whenever it changes.
  const [pasteSignal, setPasteSignal] = useState(0);
  const { count, totalIls } = cartTotals(lines);
  const editable = canEditCart(mode);

  useEffect(() => {
    // Other parts of the page (the family page's buy bar on phones) open the sheet with this event.
    const open = () => setWantOpen("cart");
    const openPaste = () => {
      setPasteSignal((n) => n + 1);
      setWantOpen("paste");
    };
    window.addEventListener("cart:open", open);
    window.addEventListener("cart:open-paste", openPaste);
    // A sign-in link comes back with ?cart=open, so the sheet is waiting where the guest left it.
    const url = new URL(window.location.href);
    if (url.searchParams.get("cart") === "open") {
      url.searchParams.delete("cart");
      window.history.replaceState(window.history.state, "", url);
      open();
    }
    return () => {
      window.removeEventListener("cart:open", open);
      window.removeEventListener("cart:open-paste", openPaste);
    };
  }, []);

  // The sheet only exists once the cart has loaded, so an early request waits for it.
  useEffect(() => {
    if (!wantOpen || !editable || !sheet.current) return;
    if (!sheet.current.open) sheet.current.showModal();
    // showModal focuses the close button; a paste request goes straight to the paste box.
    if (wantOpen === "paste") sheet.current.querySelector("textarea")?.focus();
    setWantOpen(false);
  }, [wantOpen, editable]);

  if (!editable) return null;
  const close = () => sheet.current?.close();

  return (
    <>
      {count > 0 && (
        <button
          type="button"
          data-cart-pill
          onClick={() => sheet.current?.showModal()}
          className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto flex h-12 w-max items-center gap-3 rounded-full bg-foreground ps-5 pe-6 text-background shadow-lift transition-transform duration-300 ease-spring starting:scale-75 active:scale-95 md:inset-x-auto md:end-8 md:bottom-8 md:mx-0 print:hidden"
        >
          <ShoppingBag size={20} strokeWidth={1.75} aria-hidden />
          <span className="text-[15px] font-medium">
            סל <span className="rounded-full bg-background/20 px-2 py-0.5 text-[13px] tabular-nums">{count}</span>
          </span>
          <span className="h-4 w-px bg-current opacity-30" aria-hidden />
          <span className="text-[15px] font-semibold tabular-nums">{formatIls(totalIls)}</span>
        </button>
      )}

      <dialog ref={sheet} aria-label="הסל" className="sheet sheet-side" onClick={(e) => e.target === sheet.current && close()}>
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-center justify-between border-b border-line px-6 py-3">
            <h2 className="text-section font-semibold">הסל</h2>
            <CloseButton onClick={close} />
          </div>
          <div className="flex-1 overflow-y-auto px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <CartPanel onNavigate={close} pasteSignal={pasteSignal} />
          </div>
        </div>
      </dialog>
    </>
  );
}
