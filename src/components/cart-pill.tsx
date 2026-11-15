"use client";

import { ShoppingBag, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { countOf, ITEM } from "@/domain/plural";
import { formatIls } from "@/domain/pricing";
import { canEditCart, cartTotals, useCart } from "./cart-store";
import { TeamName } from "@/components/team-name";
import { ShareCartButton } from "./share-cart-button";

// The panel (sign-in, team setup, sending) is most of the cart's code and is only needed
// once the sheet opens, so it loads on first open; a hover, touch or a filled cart fetches it early.
const loadPanel = () => import("./cart-panel");
const CartPanel = dynamic(() => loadPanel().then((m) => m.CartPanel), {
  loading: () => (
    <div className="flex flex-col gap-3 py-4" aria-hidden>
      <div className="h-16 animate-pulse rounded-xl bg-subtle" />
      <div className="h-16 animate-pulse rounded-xl bg-subtle" />
    </div>
  ),
});

/** Opens the cart sheet from anywhere on the site. */
export const openCart = () => window.dispatchEvent(new Event("cart:open"));

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="סגירה" className="-me-3 flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground">
      <X size={20} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

/**
 * The header's cart button, so the cart can be found while it's still empty. From 768px,
 * where the floating pill is hidden, it shows the ₪ total beside the count.
 * Hidden for those who can't change a cart, such as the admin.
 */
export function CartButton() {
  const { mode, lines } = useCart();
  // The slot stays, so the header doesn't jump when an admin's header finishes loading.
  if (mode !== "loading" && !canEditCart(mode)) return <span className="size-11 shrink-0" aria-hidden />;
  const { count, totalIls } = cartTotals(lines);
  return (
    <button
      type="button"
      data-cart-button
      onClick={openCart}
      onPointerEnter={loadPanel}
      onTouchStart={loadPanel}
      onFocus={loadPanel}
      aria-label={count > 0 ? `הסל, ${countOf(count, ITEM)}, ${formatIls(totalIls)}` : "הסל"}
      className={`cart-button relative flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-line bg-surface shadow-2xs hover:bg-subtle text-foreground transition-colors ${count > 0 ? "md:ps-3 md:pe-4" : ""}`}
    >
      <ShoppingBag size={20} strokeWidth={1.75} aria-hidden />
      {count > 0 && (
        <span className="hidden text-callout font-semibold tabular-nums md:inline" aria-hidden>
          {formatIls(totalIls)}
        </span>
      )}
      {count > 0 && (
        <span className="cart-count absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-caption font-semibold text-white tabular-nums ring-2 ring-background">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

/**
 * The cart sheet, where the request is sent too (there's no checkout page), and on
 * phones a pill under the thumb with the count and ₪ total that opens it.
 */
export function CartPill() {
  const { mode, lines, team } = useCart();
  const sheet = useRef<HTMLDialogElement>(null);
  const [wantOpen, setWantOpen] = useState(false);
  // The panel mounts with the first open and stays; a new one each time the sheet closes.
  const [panelMounted, setPanelMounted] = useState(false);
  // A new panel each time the sheet closes, so "sent" doesn't outlive the sheet.
  const [panelKey, setPanelKey] = useState(0);
  const { count, totalIls } = cartTotals(lines);
  const editable = canEditCart(mode);
  const hasLines = count > 0;

  // Someone with a filled cart is likely to open it: fetch the panel once the page is idle.
  useEffect(() => {
    if (!hasLines) return;
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000));
    idle(() => void loadPanel());
  }, [hasLines]);

  useEffect(() => {
    // Other parts of the page (the family page's buy bar on phones) open the sheet with this event.
    const open = () => setWantOpen(true);
    window.addEventListener("cart:open", open);
    // A sign-in link comes back with ?cart=open, so the sheet is waiting where the guest left it.
    const url = new URL(window.location.href);
    if (url.searchParams.get("cart") === "open") {
      url.searchParams.delete("cart");
      window.history.replaceState(window.history.state, "", url);
      open();
    }
    return () => window.removeEventListener("cart:open", open);
  }, []);

  // The sheet only exists once the cart has loaded, so an early request waits for it.
  useEffect(() => {
    if (!wantOpen || !editable || !sheet.current) return;
    setPanelMounted(true);
    if (!sheet.current.open) sheet.current.showModal();
    setWantOpen(false);
  }, [wantOpen, editable]);

  if (!editable) return null;
  const close = () => sheet.current?.close();
  const openSheet = () => {
    setPanelMounted(true);
    sheet.current?.showModal();
  };

  return (
    <>
      {count > 0 && (
        <button
          type="button"
          data-cart-pill
          onClick={openSheet}
          onPointerEnter={loadPanel}
          onTouchStart={loadPanel}
          // Phones only: from 768px the header's cart button carries the count and total, and the pill would cover cards.
          className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 mx-auto flex h-12 w-max items-center gap-3 rounded-full btn-brand ps-5 pe-6 shadow-lift transition-transform duration-300 ease-spring starting:scale-75 active:scale-95 md:hidden print:hidden"
        >
          <ShoppingBag size={20} strokeWidth={1.75} aria-hidden />
          <span className="text-callout font-medium">
            סל <span className="rounded-full bg-background/20 px-2 py-0.5 text-caption tabular-nums">{count}</span>
          </span>
          <span className="h-4 w-px bg-current opacity-30" aria-hidden />
          <span className="text-callout font-semibold tabular-nums">{formatIls(totalIls)}</span>
        </button>
      )}

      <dialog
        ref={sheet}
        aria-label="הסל"
        className="sheet sheet-side"
        onClose={() => setPanelKey((k) => k + 1)}
        onClick={(e) => e.target === sheet.current && close()}
      >
        <div className="flex h-full max-h-[inherit] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-line px-6 py-2">
            <div className="flex min-w-0 flex-col">
              <h2 className="truncate text-section font-semibold">
                {team ? (
                  <>
                    סל הקבוצה, <TeamName team={team} />
                  </>
                ) : (
                  "הסל"
                )}
              </h2>
              {count > 0 && <span className="text-caption text-muted">{countOf(count, ITEM)}</span>}
            </div>
            <div className="flex shrink-0 items-center">
              <ShareCartButton />
              <CloseButton onClick={close} />
            </div>
          </div>
          <div className="flex flex-1 flex-col overflow-y-auto px-6 pt-2">
            {panelMounted && <CartPanel key={panelKey} onNavigate={close} onContinue={close} />}
          </div>
        </div>
      </dialog>
    </>
  );
}
