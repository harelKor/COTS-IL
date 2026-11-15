import { darkLogo } from "@/domain/vendors";
import { Ltr } from "./ltr";

/**
 * A vendor's name as its own logo (`suppliers.logo_url`, set in הגדרות › ספקים), large, with the
 * name as its alt text; without a logo, the name in the brand gradient. One height for every logo
 * (wide ones stop at the max width), never stretched.
 */
const LOGO_SIZE = {
  md: "h-12 max-w-[min(100%,220px)] sm:h-14",
  lg: "h-14 max-w-[260px] sm:h-16",
  // The header of a home vendor box, straight on the dark glass (vendor-boxes.tsx).
  card: "h-12 max-w-[min(100%,230px)] sm:h-14",
  // A vendor store's flagship header (/v/<code>), the page's centrepiece.
  hero: "h-12 max-w-[min(100%,320px)] sm:h-16",
  // Above a product's name on its page (family-view.tsx), in place of "נמכר אצל".
  product: "h-12 max-w-[min(100%,220px)] sm:h-16",
  // The same, when two or more vendors share the row.
  productPair: "h-11 max-w-[min(100%,170px)] sm:h-13",
  // The header's "ספקים" menu (site-header.tsx).
  menu: "h-7 max-w-[min(100%,140px)]",
};

/**
 * A vendor's logo for both themes (LM1): its own colours in the light theme, its white-ink copy from
 * public/vendors/on-dark (or, for an upload without one, a CSS filter that turns its ink white,
 * `.vendor-logo-invert`) in the dark theme. Both are in the page and the theme hides one in CSS
 * (`.only-light`/`.only-dark` in globals.css), so no script decides and nothing flashes.
 */
export function ThemedLogo({ src, className = "", loading = "lazy" }: { src: string; className?: string; loading?: "lazy" | "eager" }) {
  const onDark = darkLogo(src);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden loading={loading} referrerPolicy="no-referrer" className={`only-light ${className}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={onDark ?? src} alt="" aria-hidden loading={loading} referrerPolicy="no-referrer" className={`only-dark vendor-logo ${onDark ? "" : "vendor-logo-invert"} ${className}`} />
    </>
  );
}

/**
 * `tone="auto"` (the default): the logo follows the theme (ThemedLogo). `tone="dark"`: the white-ink
 * copy always, for the home page and the vendor stores, which keep the night look in both themes
 * until their daylight versions (docs/LIGHT-MODE-PLAN.md, LM2 and LM3).
 */
export function VendorMark({
  name,
  logoUrl,
  size = "md",
  eager = false,
  tone = "auto",
}: {
  name: string;
  logoUrl: string | null;
  size?: keyof typeof LOGO_SIZE;
  eager?: boolean;
  tone?: "auto" | "dark";
}) {
  if (!logoUrl) {
    return <Ltr className="text-brand-gradient text-[24px] leading-tight font-semibold tracking-tight sm:text-[28px]">{name}</Ltr>;
  }
  const loading = eager ? "eager" : "lazy";
  const fit = `w-auto object-contain object-start ${LOGO_SIZE[size]}`;
  if (tone === "auto") {
    // The name for screen readers once; the two pictures are decoration.
    return (
      <span role="img" aria-label={name} className="inline-flex">
        <ThemedLogo src={logoUrl} loading={loading} className={fit} />
      </span>
    );
  }
  const onDark = darkLogo(logoUrl);
  return (
    // The vendor's own header logo (a copy in public/vendors, or the admin's upload).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={onDark ?? logoUrl}
      alt={name}
      loading={loading}
      referrerPolicy="no-referrer"
      className={`${fit} vendor-logo ${onDark ? "" : "vendor-logo-invert"}`}
    />
  );
}
