import { Ltr } from "./ltr";

/**
 * A vendor's name as its own logo (`suppliers.logo_url`, set in הגדרות › ספקים), large, with the
 * name as its alt text; without a logo, the name in the brand gradient. One height for every logo
 * (wide ones stop at the max width), never stretched.
 */
export function VendorMark({ name, logoUrl, size = "md", eager = false }: { name: string; logoUrl: string | null; size?: "md" | "lg"; eager?: boolean }) {
  if (!logoUrl) {
    return <Ltr className="text-brand-gradient text-[24px] leading-tight font-semibold tracking-tight sm:text-[28px]">{name}</Ltr>;
  }
  return (
    // The vendor's own header logo (a copy for light backgrounds in public/vendors, or the admin's upload).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={name}
      loading={eager ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      className={`w-auto object-contain object-start ${size === "lg" ? "h-14 max-w-[260px] sm:h-16" : "h-12 max-w-[min(100%,220px)] sm:h-14"}`}
    />
  );
}
