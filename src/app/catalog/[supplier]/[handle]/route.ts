import { type NextRequest } from "next/server";
import { familyHref } from "@/components/catalog";
import { resolveProductUrl } from "@/lib/catalog";
import { catalogHref } from "@/lib/catalog-filters";

/** Fail fast instead of Vercel's 300 s default: every query stops at 8 s (src/db/index.ts). */
export const maxDuration = 15;

/**
 * Old product URLs (/catalog/wcp/wcp-0749), from before the catalog listed
 * families. They redirect for good to the family, with that variant selected,
 * so shared links, carts and orders keep working. A WCP collection page, which
 * has no family, goes to its category.
 */
export async function GET(request: NextRequest, { params }: RouteContext<"/catalog/[supplier]/[handle]">) {
  const { supplier, handle } = await params;
  const found = await resolveProductUrl(supplier, decodeURIComponent(handle));
  const to = !found
    ? null
    : found.familySlug
      ? familyHref(found.familySlug, found.variant, found.vendor)
      : found.categorySlug
        ? catalogHref({ category: found.categorySlug })
        : null;
  if (!to) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return Response.redirect(new URL(to, request.url), 308);
}
