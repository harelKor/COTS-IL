import Link from "next/link";
import type { ReactNode } from "react";
import { contactChannels, hasContactDetails } from "@/domain/go-live";
import { inlineFacts, parseInfoText, resolveInfo, type BlockToken, type InfoPageKey, INFO_PAGES } from "@/domain/info-text";
import { ORDER_STEPS, statusLabel } from "@/domain/order-status";
import { leadTimeText } from "@/domain/lead-time";
import { markupText } from "@/domain/pricing";
import { pageText, type Business } from "@/domain/settings";
import { getFacets } from "@/lib/catalog";
import { getSettings, getSiteFacts } from "@/lib/settings";
import { ContactButtons } from "./contact-buttons";
import { StatusTag } from "./form";
import { InfoPage } from "./info-page";
import { InfoBody, InfoIntro, StepCards } from "./info-text";
import { Ltr } from "./ltr";
import { WhatsAppLink } from "./whatsapp-link";

/**
 * The info pages (S16d): the admin's text from תוכן האתר, with the facts and blocks built from
 * פרטי העסק. `infoBlocks` also feeds the editor's preview.
 */

/** The steps in the words the order page and the emails use (T4); "ready" in both its forms. */
const TEAM_STEPS = ORDER_STEPS.flatMap((s) => (s === "to_team" ? [statusLabel(s, "team", true), statusLabel(s, "team", false)] : [statusLabel(s, "team")]));

/** The blocks the settings can fill now; a block with nothing to show is left out. */
export async function infoBlocks(business: Business): Promise<Partial<Record<BlockToken, ReactNode>>> {
  const { suppliers } = await getFacets();
  const out: Partial<Record<BlockToken, ReactNode>> = {
    "שלבי ההזמנה": (
      <ol className="flex flex-wrap gap-2" aria-label="שלבי ההזמנה">
        {TEAM_STEPS.map((label) => (
          <li key={label}>
            <StatusTag>{label}</StatusTag>
          </li>
        ))}
      </ol>
    ),
  };
  const leads = suppliers.flatMap((s) => {
    const text = leadTimeText(business.leadTimes[s.code]);
    return text ? [{ code: s.code, name: s.name, text }] : [];
  });
  if (leads.length > 0)
    out["זמני אספקה"] = (
      <ul className="flex flex-col gap-1">
        {leads.map((l) => (
          <li key={l.code} className="flex justify-between gap-3">
            <Ltr>{l.name}</Ltr>
            <span className="text-muted tabular-nums">{l.text}</span>
          </li>
        ))}
      </ul>
    );
  if (business.pickupAddress)
    out["איסוף"] = (
      <p>
        איסוף עצמי: {business.pickupAddress}
        {business.pickupHours ? `, ${business.pickupHours}` : ""}.
      </p>
    );
  if (business.legalName || business.companyNumber)
    out["פרטי העסק"] = (
      <>
        {business.legalName && <p>{business.legalName}</p>}
        {business.companyNumber && (
          <p>
            ח.פ. <Ltr>{business.companyNumber}</Ltr>
          </p>
        )}
      </>
    );
  // Nothing to list (no email, phone, WhatsApp or address): no block, so the section and its
  // heading are dropped instead of standing empty.
  if (hasContactDetails(business))
    out["דרכי קשר"] = (
      <>
        {business.email && (
          <p>
            דוא״ל:{" "}
            <a href={`mailto:${business.email}`} className="text-brand hover:underline">
              <Ltr>{business.email}</Ltr>
            </a>
          </p>
        )}
        {business.phone && (
          <p>
            טלפון:{" "}
            <a href={`tel:${business.phone.replace(/[^\d+]/g, "")}`} className="text-brand hover:underline">
              <Ltr>{business.phone}</Ltr>
            </a>
          </p>
        )}
        {business.pickupAddress && (
          <p>
            כתובת: {business.pickupAddress}
            {business.pickupHours ? `, ${business.pickupHours}` : ""}
          </p>
        )}
        <WhatsAppLink />
      </>
    );
  return out;
}

/** The facts for the inline tokens. */
export async function infoFacts(business: Business) {
  const [{ markupRange }, { suppliers }] = await Promise.all([getSiteFacts(), getFacets()]);
  return inlineFacts(business, markupText(markupRange), {
    vendorNames: suppliers.map((s) => s.name),
    hasContact: contactChannels(business).length > 0,
  });
}

/** The four order steps from the "איך זה עובד" text, as the home page shows them. */
export async function HowItWorksSteps() {
  const { business, content } = await getSettings();
  const facts = await infoFacts(business);
  const doc = resolveInfo(parseInfoText(pageText(content, "how")), facts, new Set());
  const steps = [...doc.intro, ...doc.sections.flatMap((s) => s.blocks)].flatMap((b) => (b.t === "steps" ? b.items : []));
  return steps.length > 0 ? <StepCards steps={steps} /> : null;
}

export async function InfoTextPage({ page }: { page: InfoPageKey }) {
  const { business, content } = await getSettings();
  const [blocks, facts] = await Promise.all([infoBlocks(business), infoFacts(business)]);
  const contact = page === "contact";
  // The contact page leads with the buttons, so its "how to reach us" list would say it twice.
  const shown = contact ? Object.fromEntries(Object.entries(blocks).filter(([k]) => k !== "דרכי קשר")) : blocks;
  const doc = resolveInfo(parseInfoText(pageText(content, page)), facts, new Set(Object.keys(shown)));
  const { title, path } = INFO_PAGES.find((p) => p.key === page)!;
  // With no contact details yet, the contact page says where a question does get an answer.
  const noContact = contact && !hasContactDetails(business);
  return (
    <InfoPage
      title={title}
      path={path}
      lead={
        <>
          {contact && <ContactButtons business={business} />}
          <InfoIntro doc={doc} auto={shown} />
          {noContact && (
            <p className="text-muted">
              שאלה על בקשה ששלחתם נענית בדף ההזמנה שלה, יחד עם הצעת המחיר.{" "}
              <Link href="/orders" className="text-brand hover:underline">
                ההזמנות של הקבוצה
              </Link>
            </p>
          )}
        </>
      }
    >
      <InfoBody doc={doc} auto={shown} faq={page === "faq"} />
    </InfoPage>
  );
}
