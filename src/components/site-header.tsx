import { Suspense } from "react";
import Link from "next/link";
import { Boxes, Check } from "lucide-react";
import { signout } from "@/app/auth/actions";
import { switchTeam } from "@/app/cart/actions";
import { getViewer, orderingTeam, orderingTeams } from "@/lib/auth";
import { googleSignInEnabled } from "@/lib/auth-providers";
import { getCart, getCheckoutDefaults, toSheetLine } from "@/lib/orders";
import type { CartState } from "./cart-store";
import { CartButton } from "./cart-pill";
import { CartSync } from "./cart-sync";
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
  else {
    const [lines, checkout] = await Promise.all([getCart(team.id), getCheckoutDefaults(team.id)]);
    cart = {
      mode: "ordering",
      team: { name: team.name, program: team.program, number: team.number, status: team.status },
      checkout,
      lines: lines.map(toSheetLine),
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
  const switchable = orderingTeams(viewer);
  const initial = shown ? String(shown.number).slice(0, 4) : viewer.email.slice(0, 1).toUpperCase();

  return (
    <>
      <CartSync cart={cart} />
      <button
        type="button"
        popoverTarget="account-menu"
        aria-label="החשבון שלי"
        className="group flex size-11 shrink-0 items-center justify-center"
      >
        <span className="flex h-9 min-w-9 items-center justify-center rounded-full border border-line bg-white/90 px-1.5 text-[12px] font-semibold tabular-nums shadow-2xs transition-colors group-hover:bg-subtle">
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
              {shown.name}, <Ltr>{`${shown.program} ${shown.number}`}</Ltr>
            </>
          ) : (
            <Ltr>{viewer.email}</Ltr>
          )}
        </div>
        {switchable.length > 1 && (
          <div className="flex flex-col border-b border-line py-1" role="group" aria-label="החלפת קבוצה">
            {switchable.map((t) => (
              <form key={t.id} action={switchTeam.bind(null, t.id)}>
                <button
                  aria-pressed={t.id === team?.id}
                  className={`${menuLink} w-full justify-between gap-2 text-start ${t.id === team?.id ? "font-semibold text-brand" : ""}`}
                >
                  <span className="truncate">
                    {t.name}, <Ltr>{`${t.program} ${t.number}`}</Ltr>
                  </span>
                  {t.id === team?.id && <Check size={16} aria-hidden />}
                </button>
              </form>
            ))}
          </div>
        )}
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
                חשבון הקבוצה
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
        <Link href="/" aria-label="COTS-IL, דף הבית" className="flex h-11 shrink-0 items-center gap-2">
          <span aria-hidden className="btn-brand flex size-9 items-center justify-center rounded-xl">
            <Boxes size={20} strokeWidth={1.75} />
          </span>
          <Ltr className="bg-gradient-to-r from-[#1E3A8A] to-[#2563EB] bg-clip-text text-[19px] font-extrabold tracking-tight text-transparent">
            COTS-IL
          </Ltr>
          <span className="hidden rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand sm:inline-flex">
            <Ltr>FRC / FTC</Ltr>
          </span>
        </Link>
        <div className="flex min-w-0 flex-1 justify-end sm:justify-center">
          <SearchPanel />
        </div>
        <CartButton />
        <Suspense fallback={<span className="skeleton size-9 shrink-0 rounded-full" aria-hidden />}>
          <Account />
        </Suspense>
      </div>
    </header>
  );
}
