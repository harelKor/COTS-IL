import { type NextRequest } from "next/server";
import { getDiscoveryPage, type CardFamily } from "@/lib/catalog";
import { cachedJson } from "@/lib/cache-headers";

/** Fail fast instead of Vercel's 300 s default: every query stops at 8 s (src/db/index.ts). */
export const maxDuration = 15;

export type DiscoverPage = { cards: CardFamily[]; pages: number };

/**
 * One more page of the endless "גלו עוד" strip: `vendor` (a supplier code, or empty for every
 * vendor) and `page` (any integer; pages wrap around). Today's pool is fixed per day, so the
 * answer caches like the catalog.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const vendor = (params.get("vendor") ?? "").toLowerCase();
  const page = Number(params.get("page") ?? "0");
  if (!/^[a-z0-9-]{0,24}$/.test(vendor) || !Number.isInteger(page) || Math.abs(page) > 10_000) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  return cachedJson((await getDiscoveryPage(vendor, page)) satisfies DiscoverPage);
}
