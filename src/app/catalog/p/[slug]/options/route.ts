import { PUBLIC_CACHE } from "@/lib/cache-headers";
import { getFamily } from "@/lib/catalog";
import { usdIlsRate } from "@/lib/fx";
import { optionsTableHtml } from "@/lib/options-table";

/** Fail fast instead of Vercel's 300 s default: every query stops at 8 s (src/db/index.ts). */
export const maxDuration = 15;

/**
 * The family page's "all options" table, rendered here as HTML and loaded when it's opened:
 * hundreds of rows were most of the page's weight. Cached on the CDN like the catalog.
 */
export async function GET(_request: Request, { params }: RouteContext<"/catalog/p/[slug]/options">) {
  const result = await getFamily(decodeURIComponent((await params).slug));
  if (!result) return new Response("", { status: 404 });
  const html = optionsTableHtml(result.variants, result.family.optionKeys, result.family.slug, await usdIlsRate());
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": PUBLIC_CACHE } });
}
