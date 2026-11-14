import Link from "next/link";
import { Suspense, ViewTransition } from "react";
import { GroupBoxes } from "@/components/group-boxes";
import { VendorBoxes } from "@/components/vendor-boxes";
import { FrcDoodles } from "@/components/frc-doodles";
import { RobotBackdrop } from "@/components/robot-backdrop";
import { Ltr } from "@/components/ltr";
import { Loading, TileGridSkeleton } from "@/components/skeleton";
import { ReorderButton } from "@/components/reorder-button";
import { LastOrderNotice } from "@/components/last-order-notice";
import { formatIls } from "@/domain/pricing";
import { getViewer, orderingTeam } from "@/lib/auth";
import { cartCount, listOrders } from "@/lib/orders";
import { getDiscoveryPage, getFacets, getLastSync, getVendors } from "@/lib/catalog";
import { DiscoveryStrip } from "@/components/discovery-strip";
import { markupText } from "@/domain/pricing";
import { getBusiness, getSiteFacts } from "@/lib/settings";
import { typicalLeadTime } from "@/domain/lead-time";
import { HowItWorksSteps } from "@/components/how-it-works-steps";
import { BadgeCheck, Bot, Boxes, Cog, Coins, FileCheck2, Truck, Undo2 } from "lucide-react";
import { catalogHref } from "@/lib/catalog-filters";
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
  const [[last], inCart] = await Promise.all([listOrders(team.id), cartCount(team.id)]);
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

/** The way in: one big box per vendor. */
async function Vendors() {
  const vendors = await getVendors();
  return (
    <section id="vendors" aria-labelledby="vendors-title" className="scroll-mt-20">
      <h2 id="vendors-title" className="mb-4 flex items-center gap-2 text-section font-semibold">
        <Cog size={20} strokeWidth={1.75} aria-hidden className="doodle-spin text-brand" />
        מאיזה ספק קונים?
      </h2>
      <VendorBoxes vendors={vendors} />
    </section>
  );
}

/** Today's picks from every vendor. */
async function Discover() {
  const { cards, pages } = await getDiscoveryPage("", 0);
  return <DiscoveryStrip cards={cards} pages={pages} vendor="" />;
}

/** The second way in: every category, across all vendors, under its group. */
async function Browse() {
  const { categories } = await getFacets();
  return (
    <section aria-labelledby="browse-title">
      <div className="mb-4 flex flex-col gap-1">
        <h2 id="browse-title" className="flex items-center gap-2 text-section font-semibold">
          <Bot size={20} strokeWidth={1.75} aria-hidden className="doodle-drift text-brand" />
          לפי סוג מוצר, מכל הספקים
        </h2>
        <p className="text-caption text-muted">אותו חלק מכמה ספקים מופיע פעם אחת, עם ההצעה הזולה שבמלאי.</p>
      </div>
      <GroupBoxes categories={categories.map((c) => ({ ...c, href: catalogHref({ category: c.slug }) }))} />
    </section>
  );
}

/** Under the hero: the three things a first-time team asks before anything else. */
async function ValueStrip() {
  const business = await getBusiness();
  const items = [
    business.priceIncludes ? `מחיר בש״ח כולל ${business.priceIncludes}` : "מחיר הספק בש״ח, בלי תוספת",
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

const why = (times: string) => [
  { icon: Boxes, title: "הזמנה אחת לכל הספקים", text: "סל אחד מכל ארבעת הספקים, במקום ארבע הזמנות נפרדות." },
  { icon: Coins, title: "מחיר בשקלים", text: `מחיר הספק לפי השער היציג של בנק ישראל, כפול ${times}. בלי כרטיס אשראי בדולרים.` },
  { icon: Truck, title: "משלוח מרוכז", text: "אנחנו מאחדים הזמנות למשלוח אחד ומוסרים לקבוצה." },
  { icon: FileCheck2, title: "בלי ניירת מכס", text: "היבוא והשחרור עלינו. אתם מקבלים את החלקים." },
];

async function WhyUs() {
  const [business, { markupRange }] = await Promise.all([getBusiness(), getSiteFacts()]);
  const WHY = why(markupText(markupRange));
  const items = business.returnPolicy
    ? [...WHY, { icon: Undo2, title: "החזרות בישראל", text: business.returnPolicy }]
    : WHY;
  return (
    <section>
      <h2 className="mb-4 text-section font-semibold">למה דרך COTS-IL ולא ישירות מהספק</h2>
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

const SITE_URL = siteUrl();

/** Only facts the business has supplied (פרטי העסק in the admin) appear, nothing is invented. */
async function OrganizationJsonLd() {
  const business = await getBusiness();
  const json = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: business.legalName ?? "COTS-IL",
    alternateName: "COTS-IL",
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
      <div className="flex flex-col gap-8">
        <FrcDoodles />
        <RobotBackdrop />
        <OrganizationJsonLd />
        <Suspense>
          <TeamNotice />
        </Suspense>

        {/* The vendors come first, right under the header: the search lives in the header. */}
        <div className="flex flex-col gap-3">
          <h1 className="text-section font-semibold sm:text-title">
            ציוד <Ltr>FRC</Ltr> ו-<Ltr>FTC</Ltr> מכל הספקים, <span className="text-brand-gradient">בהזמנה אחת</span>
          </h1>
          <Suspense
            fallback={
              <Loading>
                <TileGridSkeleton count={4} />
              </Loading>
            }
          >
            <Vendors />
          </Suspense>
        </div>

        <Suspense>
          <Discover />
        </Suspense>

        <ValueStrip />

        <Suspense
          fallback={
            <Loading>
              <TileGridSkeleton />
            </Loading>
          }
        >
          <Browse />
        </Suspense>

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
