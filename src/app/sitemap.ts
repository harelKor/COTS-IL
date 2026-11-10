import type { MetadataRoute } from "next";
import { INFO_LINKS } from "@/components/site-footer";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cots-il.vercel.app";

/** The static pages. Product pages join in S9 (SEO), from the families table. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/catalog", ...INFO_LINKS.map((l) => l.href)].map((path) => ({ url: `${SITE}${path}` }));
}
