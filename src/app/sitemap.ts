import type { MetadataRoute } from "next";
import { INFO_LINKS } from "@/domain/site-nav";
import { siteUrl } from "@/lib/site-url";
import { vendorHref } from "@/domain/vendors";
import { getFacets } from "@/lib/catalog";

const SITE = siteUrl();

/** The static pages. Product pages join in S9 (SEO), from the families table. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Every vendor with a store (the suppliers table), so a new one is listed by itself.
  const { suppliers } = await getFacets();
  return ["/", "/catalog", ...suppliers.map((v) => vendorHref(v.code)), ...INFO_LINKS.map((l) => l.href)].map((path) => ({ url: `${SITE}${path}` }));
}
