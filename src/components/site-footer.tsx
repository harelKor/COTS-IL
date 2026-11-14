import Link from "next/link";
import { getBusiness } from "@/lib/settings";
import { Ltr } from "./ltr";
import { WhatsAppLink } from "./whatsapp-link";

export const INFO_LINKS = [
  { href: "/how-it-works", label: "איך זה עובד" },
  { href: "/faq", label: "שאלות נפוצות" },
  { href: "/shipping", label: "משלוח וזמני אספקה" },
  { href: "/returns", label: "החזרות" },
  { href: "/terms", label: "תנאי שימוש" },
  { href: "/privacy", label: "פרטיות" },
  { href: "/contact", label: "צור קשר" },
  { href: "/about", label: "מי אנחנו" },
] as const;

/** On every page: where to read how it works, and who the seller is. */
export async function SiteFooter() {
  const business = await getBusiness();
  return (
    <footer className="site-footer border-t border-line bg-white/70 print:hidden">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 pt-8 pb-28 md:px-12">
        <nav aria-label="מידע">
          <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-4">
            {INFO_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="flex min-h-11 items-center text-callout text-muted hover:text-brand">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-4 text-caption text-muted">
          <p>
            <Ltr className="font-semibold text-foreground">COTS-IL</Ltr>
            {business.legalName && <>, {business.legalName}</>}
            {business.companyNumber && (
              <>
                , ח.פ. <Ltr>{business.companyNumber}</Ltr>
              </>
            )}
            {business.email && (
              <>
                ,{" "}
                <a href={`mailto:${business.email}`} className="hover:text-brand">
                  <Ltr>{business.email}</Ltr>
                </a>
              </>
            )}
          </p>
          <WhatsAppLink />
        </div>
      </div>
    </footer>
  );
}
