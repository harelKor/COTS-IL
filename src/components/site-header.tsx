import { Suspense } from "react";
import Link from "next/link";
import { Boxes, Check, Menu, UserRound } from "lucide-react";
import { switchTeam } from "@/app/cart/actions";
import { teamDisplay } from "@/domain/display";
import { getViewer, orderingTeam, orderingTeams } from "@/lib/auth";
import { googleSignInEnabled } from "@/lib/auth-providers";
import { getHeaderNav } from "@/lib/header-nav";
import { priceContext } from "@/lib/settings";
import { getCart, getCheckoutDefaults, toSheetLine } from "@/lib/orders";
import type { CartState } from "./cart-store";
import { CartButton } from "./cart-pill";
import { CartSync } from "./cart-sync";
import { HeaderMenu } from "./header-menu";
import { HeaderNav, HeaderNavFallback, menuLink, MenuNavSections } from "./header-nav";
import { InstallAppButton } from "./install-app";
import { Ltr } from "./ltr";
import { SearchPanel } from "./search-panel";
import { SignInLink } from "./sign-in-link";
import { SignOutButton } from "./sign-out-button";

/**
 * Everything in the header that depends on who is signed in: the account menu (below 1024px also
 * the categories and vendors), and the cart handed to the cart pill. Streams in after the static header.
 */
async function Account() {
  // All at once: the session, the Google flag, the price settings and the menu's lists (all but the session cached).
  const [viewer, googleSignIn, prices, nav] = await Promise.all([getViewer(), googleSignInEnabled(), priceContext(), getHeaderNav()]);
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
      lines: lines.map(toSheetLine(prices)),
    };
  }

  if (!viewer) {
    // A guest: "כניסה" from 640px, and below 1024px a menu with the categories and vendors ("כניסה" too on phones).
    return (
      <>
        <CartSync cart={cart} />
        <span className="hidden sm:contents">
          <SignInLink />
        </span>
        <HeaderMenu
          id="account-menu"
          label="תפריט"
          trigger={<Menu size={20} strokeWidth={1.75} aria-hidden />}
          chevron={false}
          triggerClassName="account-chip flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors lg:hidden"
          width={320}
          align="end"
          panelClassName="lg:hidden"
        >
          <div className="flex flex-col border-b border-line pb-1 sm:hidden">
            <SignInLink className={`${menuLink} font-semibold text-brand`} />
          </div>
          <MenuNavSections nav={nav} />
          <div className="flex flex-col pt-1 empty:hidden">
            <InstallAppButton variant="menu" />
          </div>
        </HeaderMenu>
      </>
    );
  }

  const shown = team ?? viewer.teams[0];
  const switchable = orderingTeams(viewer);

  return (
    <>
      <CartSync cart={cart} />
      <HeaderMenu
        id="account-menu"
        label={shown ? `${teamDisplay(shown)}, החשבון` : "החשבון שלי"}
        trigger={
          shown ? (
            // The team the cart and orders belong to: its number, and from 1280px its name too.
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="hidden max-w-[10rem] truncate xl:inline">{shown.name}</span>
              <Ltr className="tabular-nums">{String(shown.number)}</Ltr>
            </span>
          ) : (
            <UserRound size={20} strokeWidth={1.75} aria-hidden />
          )
        }
        chevron="hidden sm:block"
        triggerClassName="account-chip flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full border px-3 text-callout font-semibold transition-colors"
        width={320}
        align="end"
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
        <nav aria-label="החשבון" className="flex flex-col py-1">
          {team ? (
            <>
              <Link href="/orders" className={menuLink}>
                ההזמנות שלנו
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
        </nav>
        <div className="border-t border-line lg:hidden" />
        <MenuNavSections nav={nav} />
        <div className="flex flex-col border-t border-line pt-1 lg:border-t-0">
          <InstallAppButton variant="menu" />
          <SignOutButton className={`${menuLink} w-full text-start text-danger`} />
        </div>
      </HeaderMenu>
    </>
  );
}

/** "ההזמנות שלנו" for a signed-in team, from 1024px (below that it's in the account menu). */
async function OrdersLink() {
  const viewer = await getViewer();
  if (!viewer || !orderingTeam(viewer)) return null;
  return (
    <Link href="/orders" className="hidden h-11 shrink-0 items-center px-2 text-callout text-foreground hover:text-brand lg:flex">
      ההזמנות שלנו
    </Link>
  );
}

/**
 * Slim frosted bar: logo, קטלוג with the "קטגוריות" and "ספקים" menus (from 1024px; below that
 * they're in the account menu), search, the team's orders, cart (with its total from 768px; on
 * phones the floating pill shows it), account.
 */
export function SiteHeader() {
  return (
    <header className="site-header sticky top-0 z-30 border-b border-line/70 bg-glass backdrop-blur-xl backdrop-saturate-150 print:hidden">
      <div className="mx-auto flex h-[52px] max-w-[1200px] items-center gap-2 px-4 sm:gap-3 md:px-12">
        <Link href="/" aria-label="COTS-IL, דף הבית" className="flex h-11 shrink-0 items-center gap-2">
          <span aria-hidden className="btn-brand flex size-9 items-center justify-center rounded-xl">
            <Boxes size={20} strokeWidth={1.75} />
          </span>
          <Ltr className="text-brand-gradient text-section font-extrabold tracking-tight">
            COTS-IL
          </Ltr>
          <span className="hidden rounded-full bg-brand-soft px-2 py-0.5 text-caption font-semibold text-brand sm:inline-flex">
            <Ltr>FRC / FTC</Ltr>
          </span>
        </Link>
        <nav aria-label="ראשי" className="hidden shrink-0 items-center sm:flex">
          <Link href="/catalog" className="flex h-11 shrink-0 items-center px-2 text-callout text-foreground hover:text-brand">
            קטלוג
          </Link>
          <Suspense fallback={<HeaderNavFallback />}>
            <HeaderNav />
          </Suspense>
        </nav>
        <div className="flex min-w-0 flex-1 justify-end sm:justify-center">
          <SearchPanel />
        </div>
        <Suspense fallback={null}>
          <OrdersLink />
        </Suspense>
        <CartButton />
        <div className="flex min-w-11 shrink-0 items-center justify-end gap-2">
          <Suspense fallback={<span className="skeleton m-1 size-9 rounded-full" aria-hidden />}>
            <Account />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
