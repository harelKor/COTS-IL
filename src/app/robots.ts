import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://cots-il.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/q/", "/orders", "/team", "/invite", "/auth"] },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
