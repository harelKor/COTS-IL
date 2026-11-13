import type { ReactNode } from "react";
import { getSiteFacts } from "@/lib/settings";
import { SiteFactsContext } from "./site-facts";

/** Loads the settings once (cached under the `settings` tag) for every client component below. */
export async function SiteFactsProvider({ children }: { children: ReactNode }) {
  return <SiteFactsContext value={await getSiteFacts()}>{children}</SiteFactsContext>;
}
