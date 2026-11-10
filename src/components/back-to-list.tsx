"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

/** The last catalog list seen in this tab, e.g. "/catalog?category=gears&s.bore=…". */
const KEY = "cots:catalog-list";

export function rememberCatalogList(href: string) {
  try {
    sessionStorage.setItem(KEY, href);
  } catch {
    // Private mode or storage off: the breadcrumb falls back to the category.
  }
}

function lastList(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const noSubscribe = () => () => {};

/**
 * A breadcrumb link back to the catalog list the product was opened from, with its
 * filters, when that list was this category (or the whole catalog); otherwise `href`.
 */
export function BackToList({ href, category, className, children }: { href: string; category: string | null; className?: string; children: React.ReactNode }) {
  const list = useSyncExternalStore(noSubscribe, lastList, () => null);
  const sameList = list && new URL(list, "http://x").searchParams.get("category") === category;
  return (
    <Link href={sameList ? list : href} className={className}>
      {children}
    </Link>
  );
}
