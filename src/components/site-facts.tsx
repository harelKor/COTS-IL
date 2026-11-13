"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_MARKUP } from "@/domain/pricing";
import type { SiteFacts } from "@/lib/settings";

const Facts = createContext<SiteFacts>({ quoteLeadBusinessDays: null, priceIncludes: null, leadTimes: {}, markupRange: [DEFAULT_MARKUP, DEFAULT_MARKUP] });

/** The admin's business facts the browser-side cart and product page quote (S16a), from getSiteFacts(). */
export function SiteFactsContext({ value, children }: { value: SiteFacts; children: ReactNode }) {
  return <Facts.Provider value={value}>{children}</Facts.Provider>;
}

export function useSiteFacts() {
  return useContext(Facts);
}
