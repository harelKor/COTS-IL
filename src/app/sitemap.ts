import type { MetadataRoute } from "next";
import { INFO_LINKS } from "@/components/site-footer";
import { siteUrl } from "@/lib/site-url";
import { VENDORS, vendorHref } from "@/domain/vendors";

const SITE = siteUrl();

/** The static pages. Product pages join in S9 (SEO), from the families table. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/catalog", ...VENDORS.map((v) => vendorHref(v.code)), ...INFO_LINKS.map((l) => l.href)].map((path) => ({ url: `${SITE}${path}` }));
}
