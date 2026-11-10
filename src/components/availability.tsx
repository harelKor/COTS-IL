"use client";

import { useSyncExternalStore } from "react";
import { availabilityStatus, isFresh } from "@/lib/availability-text";

export { availabilityStatus, isFresh };

const noSubscribe = () => () => {};
let pageNow: number | null = null;
/** When this page loaded in the browser; null while prerendering. One value per page, so it stays stable. */
const clientNow = () => (pageNow ??= Date.now());
const serverNow = () => null;

/**
 * Today, in the browser. The prerendered page has no today (it treats check
 * dates as fresh, since the catalog syncs daily); the browser corrects a stale
 * one right after hydration. This keeps catalog and product pages static, with
 * no connection() just to read the date.
 */
export function useNow(): number | null {
  return useSyncExternalStore(noSubscribe, clientNow, serverNow);
}

/** Suppliers only tell us yes or no, so this never shows a stock count. */
export function Availability({ available, checkedAt }: { available: boolean | null; checkedAt: string }) {
  const status = availabilityStatus(available, checkedAt, isFresh(checkedAt, useNow()));
  return <span className={`text-caption ${status.tone}`}>{status.text}</span>;
}
