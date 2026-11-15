"use client";

import Link from "next/link";
import { createContext, useContext } from "react";

/**
 * How the catalog's own links move (CF3): the group bar, the breadcrumb, the subcategory tiles and
 * the sibling pills navigate inside the catalog browser's transition, so the results dim and the
 * progress line runs at once, and the bar, the panel and the strip stay mounted while the next list
 * loads. Opening one in a new tab (or with a modifier key) is an ordinary link.
 */
type Nav = { navigate: (href: string) => void; pending: boolean };

const CatalogNavContext = createContext<Nav | null>(null);

export const CatalogNavProvider = CatalogNavContext.Provider;

export function useCatalogNav(): Nav | null {
  return useContext(CatalogNavContext);
}

/**
 * A plain click on a catalog link: runs `before` (a toast when filters are dropped), then navigates
 * in the browser's transition instead of the link's own navigation. Returns false when the click
 * is the browser's (a new tab, a modifier key) or there is no catalog browser around it.
 */
export function interceptClick(e: React.MouseEvent, nav: Nav | null, href: string, before?: () => void): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  before?.();
  if (!nav) return false;
  e.preventDefault();
  nav.navigate(href);
  return true;
}

/** A link inside the catalog browser that navigates through it (interceptClick). */
export function CatalogLink({ href, before, onClick, ...props }: React.ComponentProps<typeof Link> & { href: string; before?: () => void }) {
  const nav = useCatalogNav();
  return (
    <Link
      href={href}
      onClick={(e) => {
        onClick?.(e);
        interceptClick(e, nav, href, before);
      }}
      {...props}
    />
  );
}
