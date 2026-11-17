import Link from "next/link";
import { Suspense, ViewTransition } from "react";
import { GroupBoxes } from "@/components/group-boxes";
import { VendorBoxes } from "@/components/vendor-boxes";
import { FtcPhoto, ScenePhoto } from "@/components/home-scene";
import { Reveal } from "@/components/reveal";
import { ScrollParallax } from "@/components/scroll-parallax";
import { Ltr } from "@/components/ltr";
import { Loading, TileGridSkeleton } from "@/components/skeleton";
import { ReorderButton } from "@/components/reorder-button";
import { LastOrderNotice } from "@/components/last-order-notice";
import { formatIls } from "@/domain/pricing";
import { getViewer, orderingTeam } from "@/lib/auth";
import { cartCount, latestOrder } from "@/lib/orders";
import { getCatalogCounts, getDiscoveryPage, getFacets, getLastSync, getVendors } from "@/lib/catalog";
import { DiscoveryStrip } from "@/components/discovery-strip";
import { markupText } from "@/domain/pricing";
import { getBusiness, getSettings, getSiteFacts } from "@/lib/settings";
import { typicalLeadTime } from "@/domain/lead-time";
import { HowItWorksSteps } from "@/components/info-text-page";
import { whyCards, splitLatin } from "@/domain/site-text";
import { BadgeCheck, Bot, Boxes, Cog, Coins, FileCheck2, Truck, Undo2 } from "lucide-react";
import { catalogHref } from "@/lib/catalog-filters";
import { homeVendorOrder, vendorRows } from "@/domain/vendors";
import { siteUrl } from "@/lib/site-url";

/**
 * A signed-in team sees its last order first, with "Order again" (one tap), and a
 * new team a note that its first request will be reviewed with the team.
 */
async function TeamNotice() {
  const viewer = await getViewer();
  const team = viewer && orderingTeam(viewer);
  if (!viewer || viewer.isAdmin || !team) {
    if (viewer && !viewer.isAdmin && viewer.teams.length > 0 && !team) {
      return (
        <Link href="/pending" className="block rounded-card bg-surface p-4 text-sm shadow-lift hover:bg-subtle">
          החשבון של הקבוצה מושהה. פרטים בעמוד הקבוצה.
        </Link>
      );
    }
    return null;
  }
  const [last, inCart] = await Promise.all([latestOrder(team.id), cartCount(team.id)]);
  return (
    <div className="flex flex-col gap-3">
      {team.status === "pending" && (
        <p className="rounded-card bg-surface p-4 text-sm shadow-lift">
          הקבוצה חדשה וממתינה לאישור. אפשר כבר לבנות סל ולשלוח בקשה ראשונה: הספק הישראלי יאשר את הקבוצה יחד איתה.
        </p>
      )}
      {last && (
        <LastOrderNotice orderId={last.id}>
          <Link href={`/orders/${last.id}`} className="min-w-0 hover:text-brand">
            <span className="block font-medium">ההזמנה האחרונה: מס׳ {last.number}</span>
            <span className="block text-caption text-muted">
              {last.lineCount} שורות, {formatIls(last.quoteTotal ?? last.requestTotal)}
            </span>
          </Link>
          <ReorderButton orderId={last.id} sendNow={inCart === 0} />
        </LastOrderNotice>
      )}
    </div>
  );
}

/**
 * The hero's telemetry line, from the live catalog: how many vendors and products, the shared
 * shipment. The product count is the exact number of families /catalog lists (one source,
 * getCatalogCounts); the vendor boxes' counts overlap where two vendors sell one part.
 */
async function Telemetry() {
  const [vendors, { families: total }] = await Promise.all([getVendors(), getCatalogCounts()]);
  const sep = <span aria-hidden className="scene-telemetry-sep h-4 w-px" />;
  return (
    <div className="scene-telemetry flex w-full flex-wrap items-center gap-x-4 gap-y-2 pt-3 text-caption">
      <span>
        <Ltr className="scene-telemetry-num">{vendors.length}</Ltr> ספקים
      </span>
      {sep}
      <span>
        <Ltr className="scene-telemetry-num">
          {total.toLocaleString("he-IL")}
        </Ltr>{" "}
        מוצרים בקטלוג
      </span>
      {sep}
      <span>משלוח מרוכז לישראל</span>
    </div>
  );
}

/**
 * The way in: one box per vendor. The first row runs across the page just under the hero robots'
 * bumpers, visible on load; the rest sit in a 2-column grid on the physical left on a desktop,
 * leaving the right lane open for the second field photo (not shown on phones).
 */
async function Vendors() {
  const vendors = homeVendorOrder(await getVendors());
  const { first } = vendorRows(vendors.length);
  const rest = vendors.slice(first);
  return (
    <section id="vendors" aria-labelledby="vendors-title" className="mt-10 flex scroll-mt-20 flex-col gap-4 lg:mt-[136px] lg:gap-5">
      <div className="flex items-center gap-4">
        <h2 id="vendors-title" className="flex shrink-0 items-center gap-2.5 text-section font-semibold tracking-tight lg:text-[24px]">
          <Cog strokeWidth={1.75} aria-hidden className="size-5 text-brand lg:size-6" />
          מאיזה ספק קונים?
        </h2>
        <span aria-hidden className="scene-rule h-px flex-1" />
      </div>
      <VendorBoxes vendors={vendors.slice(0, first)} layout="row" eager={first} />
      {rest.length > 0 && (
        <div className="scene-lane relative">
          <ScenePhoto kind="tall" />
          <div className="scene-lane-cards">
            <VendorBoxes vendors={rest} layout="bento" />
          </div>
        </div>
      )}
    </section>
  );
}

/** Today's picks from every vendor. */
async function Discover() {
  const { cards, pages } = await getDiscoveryPage("", 0);
  return <DiscoveryStrip cards={cards} pages={pages} vendor="" />;
}

/**
 * The second way in, right under the vendors: every category, across all vendors, under its group,
 * as big cards beside an FTC robot at the high basket (so the scene runs barge on the left, reef on
 * the right, FTC on the left). From 1024px the photo is a lane on the physical left (about 30%) and
 * the heading and cards fill the rest; below that a short strip of the robot sits over the cards.
 * As the section scrolls into view the photo rises in and the cards follow (Reveal, globals.css).
 */
async function Browse() {
  const { categories } = await getFacets();
  return (
    <section aria-labelledby="browse-title" className="ftc-section scroll-mt-20">
      <Reveal className="ftc-stage">
        <div className="ftc-lane">
          <FtcPhoto />
        </div>
        <div className="ftc-cards flex min-w-0 flex-col gap-4 lg:gap-5">
          {/* A section title, a step up from the vendors heading, so the groups read as their own part of the page. */}
          <div className="flex flex-col gap-2 pt-2 lg:pt-4">
            <div className="flex items-center gap-4">
              <h2 id="browse-title" className="flex shrink-0 items-center gap-3 text-[22px] leading-tight font-semibold tracking-[-0.02em] sm:text-title lg:text-[32px]">
                <Bot strokeWidth={1.75} aria-hidden className="size-6 text-brand lg:size-8" />
                לפי סוג מוצר, מכל הספקים
              </h2>
              <span aria-hidden className="scene-rule h-px flex-1" />
            </div>
            <p className="text-callout text-muted">אותו חלק מכמה ספקים מופיע פעם אחת, עם ההצעה הזולה שבמלאי.</p>
          </div>
          <GroupBoxes categories={categories.map((c) => ({ ...c, href: catalogHref({ category: c.slug }) }))} />
        </div>
      </Reveal>
    </section>
  );
}

/** Under the hero: the three things a first-time team asks before anything else. */
async function ValueStrip() {
  const business = await getBusiness();
  const items = [
    // What is true without any business facts: the supplier's dollar price at the Bank of Israel
    // rate (the multiplier is stated once, under "מחיר בשקלים" below), shipping priced in the quote.
    business.priceIncludes ? `מחיר בש״ח כולל ${business.priceIncludes}` : "מחיר בש״ח לפי השער היציג, משלוח בהצעת המחיר",
    "הצעת מחיר בלי התחייבות",
    business.pickupAddress ? "איסוף או משלוח בישראל" : "מסירה בישראל",
  ];
  return (
    <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-callout text-muted">
      {items.map((t) => (
        <li key={t} className="flex items-center gap-2">
          <BadgeCheck size={20} strokeWidth={1.75} aria-hidden className="text-brand" />
          {t}
        </li>
      ))}
    </ul>
  );
}

/** When the prices were last checked, and the typical lead time once it's known. */
async function TrustStrip() {
  const [synced, business] = await Promise.all([getLastSync(), getBusiness()]);
  const lead = typicalLeadTime(Object.values(business.leadTimes));
  if (!synced && !lead) return null;
  return (
    <p className="card-surface flex flex-wrap justify-center gap-x-6 gap-y-1 rounded-card p-4 text-center text-caption text-muted">
      {synced && (
        <span>
          המחירים והזמינות עודכנו מאתרי הספקים ב-
          {synced.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Jerusalem" })}
        </span>
      )}
      {lead && <span>זמן אספקה טיפוסי: {lead} מאישור ההצעה</span>}
    </p>
  );
}

/** The four cards' icons, in order; their words are the admin's (תוכן האתר, דף הבית). */
const WHY_ICONS = [Boxes, Coins, Truck, FileCheck2];

async function WhyUs() {
  const [{ business, content }, { markupRange }, vendors] = await Promise.all([getSettings(), getSiteFacts(), getVendors()]);
  const WHY = whyCards(content.home, { markup: markupText(markupRange), vendors: vendors.length }).map((c, i) => ({ ...c, icon: WHY_ICONS[i] }));
  const items = business.returnPolicy
    ? [...WHY, { icon: Undo2, title: "החזרות בישראל", text: business.returnPolicy }]
    : WHY;
  return (
    <section>
      <h2 className="mb-4 text-section font-semibold">{content.home.whyHeading}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((w) => (
          <li key={w.title} className="card-surface flex flex-col gap-2 rounded-card p-5">
            <w.icon size={20} strokeWidth={1.75} aria-hidden className="text-brand" />
            <h3 className="text-body font-semibold">{w.title}</h3>
            <p className="text-caption leading-relaxed text-muted">{w.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The motto and its sub-line: the admin's words (תוכן האתר, דף הבית), Latin words set left-to-right in the accent face. */
async function HeroWords() {
  const { home } = (await getSettings()).content;
  return (
    <>
      <h1 className="motto">
        <span className="block">
          {splitLatin(home.mottoLine).map((part, i) =>
            i % 2 === 1 ? (
              <Ltr key={i} className="motto-latin">
                {part}
              </Ltr>
            ) : (
              part
            ),
          )}
        </span>
        <span className="motto-accent block">{home.mottoAccent}</span>
      </h1>
      <p className="motto-sub -mt-2 text-body lg:-mt-3 lg:text-[19px]">{home.sub}</p>
    </>
  );
}

const SITE_URL = siteUrl();

/** Only facts the business has supplied (פרטי העסק in the admin) appear, nothing is invented. */
async function OrganizationJsonLd() {
  const business = await getBusiness();
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: business.legalName ?? "BLUEHUB",
    alternateName: "BLUEHUB",
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
    ...(business.email ? { email: business.email } : {}),
    ...(business.phone ? { telephone: business.phone } : {}),
  }).replace(/</g, "\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export default function HomePage() {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {/*
        One continuous competition photograph: an Orbit ultramarine midnight canvas (a pearl and ice
        sky in the light theme) from under the navbar to the footer, one field photo (three robots on
        the barge) on the left at the top, a second (the reef) in the right lane lower down, both as
        shot, then an FTC robot at the high basket on the left beside the groups.
      */}
      <div className="home-scene relative isolate flex flex-col gap-8">
        <div aria-hidden className="scene-canvas pointer-events-none absolute -z-20" />
        <ScrollParallax />
        <OrganizationJsonLd />

        {/*
          A short hero, so the first vendor row shows on load: the motto on the physical right,
          the field photo on the left with the robots' bumpers just above the first row.
        */}
        <section className="scene-hero relative flex flex-col">
          <ScenePhoto kind="short" />
          <div className="scene-hero-lane flex flex-col gap-6 pt-2 lg:gap-8 lg:pt-6">
            <HeroWords />
            <Suspense fallback={<div aria-hidden className="scene-telemetry min-h-8 w-full" />}>
              <Telemetry />
            </Suspense>
            <Suspense>
              <TeamNotice />
            </Suspense>
          </div>
        </section>

        <Suspense
          fallback={
            <Loading>
              <TileGridSkeleton count={4} />
            </Loading>
          }
        >
          <Vendors />
        </Suspense>

        {/* Close under the reef lane: its photo feathers out above, on the other side from the FTC lane. */}
        <div className="lg:mt-2">
          <Suspense
            fallback={
              <Loading>
                <TileGridSkeleton />
              </Loading>
            }
          >
            <Browse />
          </Suspense>
        </div>

        <div className="mt-2 lg:mt-8">
          <Suspense>
            <Discover />
          </Suspense>
        </div>

        <ValueStrip />

        <section>
          <h2 className="mb-4 text-section font-semibold">איך זה עובד</h2>
          <HowItWorksSteps />
          <Link href="/how-it-works" className="mt-3 inline-flex min-h-11 items-center text-brand hover:underline">
            כל הפרטים
          </Link>
        </section>

        <Suspense>
          <TrustStrip />
        </Suspense>

        <WhyUs />
      </div>
    </ViewTransition>
  );
}
