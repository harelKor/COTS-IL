import Link from "next/link";
import { contactButtons, FOOTER_COLUMNS, type FooterColumn } from "@/domain/site-nav";
import { getBusiness } from "@/lib/settings";
import { Ltr } from "./ltr";

const linkClass = "flex min-h-11 items-center text-callout text-muted hover:text-brand";

function Column({ column }: { column: FooterColumn }) {
  return (
    <section aria-labelledby={`footer-${column.title}`} className="flex flex-col">
      <h2 id={`footer-${column.title}`} className="mb-1 text-caption font-semibold text-foreground">
        {column.title}
      </h2>
      <ul>
        {column.links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className={linkClass}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * On every page: four columns (קנייה, עזרה, העסק, צרו קשר), then who the seller is. The contact
 * column lists only the channels that are filled in, and is left out while none is.
 */
export async function SiteFooter() {
  const business = await getBusiness();
  const channels = contactButtons(business);
  return (
    <footer className="site-footer border-t border-line bg-glass print:hidden">
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-6 pt-8 pb-28 md:px-12">
        <nav aria-label="מידע" className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {FOOTER_COLUMNS.map((c) => (
            <Column key={c.title} column={c} />
          ))}
          {channels.length > 0 && (
            <section aria-labelledby="footer-contact" className="flex flex-col">
              <h2 id="footer-contact" className="mb-1 text-caption font-semibold text-foreground">
                צרו קשר
              </h2>
              <ul>
                {channels.map((c) => (
                  <li key={c.key}>
                    <a
                      href={c.href}
                      className={linkClass}
                      {...(c.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      {c.ltr ? (
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          {c.label}
                          <Ltr>{c.value}</Ltr>
                        </span>
                      ) : (
                        c.value
                      )}
                    </a>
                  </li>
                ))}
                {business.pickupAddress && business.pickupHours && (
                  <li className="flex min-h-11 items-center text-caption text-muted">{business.pickupHours}</li>
                )}
                <li>
                  <Link href="/contact" className={linkClass}>
                    כל דרכי הקשר
                  </Link>
                </li>
              </ul>
            </section>
          )}
        </nav>
        <p className="border-t border-line pt-4 text-caption text-muted">
          <Ltr className="font-semibold text-foreground">COTS-IL</Ltr>
          {business.legalName && <>, {business.legalName}</>}
          {business.companyNumber && (
            <>
              , ח.פ. <Ltr>{business.companyNumber}</Ltr>
            </>
          )}
        </p>
      </div>
    </footer>
  );
}
