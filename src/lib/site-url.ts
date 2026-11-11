/**
 * The site's own address, for links that leave the page (emails, quote links,
 * sitemap, metadata). NEXT_PUBLIC_SITE_URL wins; on Vercel the production
 * domain is the fallback, so a missing variable never sends people to localhost.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}
