import { Suspense } from "react";
import Link from "next/link";
import { signout } from "@/app/auth/actions";
import { canOrder, canSendRequest } from "@/domain/orders";
import { priceIls } from "@/domain/pricing";
import { getViewer, orderingTeam } from "@/lib/auth";
import { googleSignInEnabled } from "@/lib/auth-providers";
import { getCart, getCheckoutDefaults } from "@/lib/orders";
import type { CartState } from "./cart-store";
import { CartButton } from "./cart-pill";
import { CartSync } from "./cart-sync";
import { productHref } from "./catalog";
import { Ltr } from "./ltr";
import { SearchPanel } from "./search-panel";

const menuLink = "flex h-11 items-center rounded-lg px-3 hover:bg-subtle";

/**
 * Everything in the header that depends on who is signed in: the account menu,
 * and the cart handed to the cart pill. Streams in after the static header.
 */
async function Account() {
  const [viewer, googleSignIn] = await Promise.all([getViewer(), googleSignInEnabled()]);
  const team = viewer && orderingTeam(viewer);

  let cart: CartState;
  if (!viewer) cart = { mode: "guest", lines: [], googleSignIn };
  else if (!team) cart = { mode: viewer.isAdmin ? "admin" : viewer.teams.length === 0 ? "noteam" : "pending", lines: [] };
  else if (!canOrder(team.role)) cart = { mode: "readonly", lines: [] };
  else {
    const [lines, checkout] = await Promise.all([getCart(team.id), getCheckoutDefaults(team.id)]);
    cart = {
      mode: "ordering",
      team: { name: team.name, program: team.program, number: team.number, status: team.status, isMentor: canSendRequest(team.role) },
      checkout,
      lines: lines.map((l) => ({
        variantId: l.variantId,
        title: l.title,
        options: l.options.map((o) => o.value).join(" / "),
        sku: l.supplierSku,
        image: l.image,
        href: productHref(l.supplierCode, l.handle),
        supplierName: l.supplierName,
        qty: l.qty,
        unitPriceIls: priceIls(l.priceUsd),
      })),
    };
  }

  if (!viewer) {
    return (
      <>
        <CartSync cart={cart} />
        <Link href="/login" className="flex h-11 shrink-0 items-center px-2 text-[15px] text-brand hover:underline">
          כניסה
        </Link>
      </>
    );
  }

  const shown = team ?? viewer.teams[0];
  const initial = shown ? String(shown.number).slice(0, 4) : viewer.email.slice(0, 1).toUpperCase();

  return (
    <>
      <CartSync cart={cart} />
      <button
        type="button"
        popoverTarget="account-menu"
        aria-label="החשבון שלי"
        className="flex size-11 shrink-0 items-center justify-center"
      >
        <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-subtle px-1.5 text-[12px] font-semibold tabular-nums">
          {initial}
        </span>
      </button>
      <div
        id="account-menu"
        popover="auto"
        className="fixed inset-auto end-4 top-[60px] m-0 w-64 rounded-card border border-line bg-surface p-2 text-[15px] text-foreground shadow-lift"
      >
        <div className="border-b border-line px-3 pt-1 pb-2 text-caption text-muted">
          {shown ? (
            <>
              {shown.name} · <Ltr>{`${shown.program} ${shown.number}`}</Ltr>
            </>
          ) : (
            <Ltr>{viewer.email}</Ltr>
          )}
        </div>
        <nav className="flex flex-col pt-1">
          {team ? (
            <>
              <Link href="/orders" className={menuLink}>
                הזמנות
              </Link>
              <Link href="/cart" className={menuLink}>
                הסל
              </Link>
              <Link href="/team" className={menuLink}>
                הקבוצה
              </Link>
            </>
          ) : (
            !viewer.isAdmin && (
              <Link href="/pending" className={menuLink}>
                סטטוס אישור הקבוצה
              </Link>
            )
          )}
          {viewer.isAdmin && (
            <Link href="/admin" className={menuLink}>
              ניהול
            </Link>
          )}
          <form action={signout}>
            <button className={`${menuLink} w-full text-start text-danger`}>יציאה</button>
          </form>
        </nav>
      </div>
    </>
  );
}

/** Slim frosted bar: logo, search, cart, account. The floating pill shows the cart's total once it has items. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-glass backdrop-blur-xl backdrop-saturate-150 print:hidden">
      <div className="mx-auto flex h-[52px] max-w-[1200px] items-center gap-3 px-4 md:px-12">
        <Link href="/" className="shrink-0 text-[17px] font-semibold tracking-tight">
          פורטל רכש <Ltr>FIRST</Ltr>
        </Link>
        <div className="flex min-w-0 flex-1 justify-end sm:justify-center">
          <SearchPanel />
        </div>
        <CartButton />
        <Suspense fallback={<span className="skeleton size-8 shrink-0 rounded-full" aria-hidden />}>
          <Account />
        </Suspense>
      </div>
    </header>
  );
}
