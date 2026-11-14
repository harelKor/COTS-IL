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
};

/**
 * `tone="dark"` (the home page and the vendor stores): the logo's white-ink copy from public/vendors/on-dark, or for an
 * upload without one, a CSS filter that turns its ink white (globals.css, `.vendor-logo-invert`).
 */
export function VendorMark({
  name,
  logoUrl,
  size = "md",
  eager = false,
  tone = "light",
}: {
  name: string;
  logoUrl: string | null;
  size?: keyof typeof LOGO_SIZE;
  eager?: boolean;
  tone?: "light" | "dark";
}) {
  if (!logoUrl) {
    return <Ltr className="text-brand-gradient text-[24px] leading-tight font-semibold tracking-tight sm:text-[28px]">{name}</Ltr>;
  }
  const onDark = tone === "dark" ? darkLogo(logoUrl) : null;
  const tint = tone === "dark" ? (onDark ? "vendor-logo" : "vendor-logo vendor-logo-invert") : "";
  return (
    // The vendor's own header logo (a copy in public/vendors, or the admin's upload).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={onDark ?? logoUrl}
      alt={name}
      loading={eager ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      className={`w-auto object-contain object-start ${LOGO_SIZE[size]} ${tint}`}
    />
  );
}
