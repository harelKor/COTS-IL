# Fix plan for the UX, design and logic audit (Nov 14, 2026)

Source: `docs/AUDIT-UX-2026-11-14.md` (finding IDs C-xx, A-xx, L-xx, D-xx). It was written from the live site, without the code. This plan checks it against the code and CLAUDE.md, and also picks up the bugs still open from the speed audit (`docs/AUDIT-2026-11-14.md`, B-xx).

Every session:
- reads CLAUDE.md, its own task below, and the findings it names in the audit;
- also reads "Design review additions" at the end of this file, which adds items to T4, T6, T7, T9, T11 and new tasks T17–T19;
- **checks each finding in the code before changing anything**, because several were wrong or are already handled (see "Checked against the code");
- commits, merges to `main` and pushes, applying any migration first; then checks the deploy (CLAUDE.md, "Production and access");
- re-checks the acceptance items on production and ticks them in the Progress table.

## Checked against the code

**Probably wrong in the audit:**
- **C-15 / L-01 (wrong SKU on Kraken X60).** The product page shows the SKU of the chosen offer's own variant (`family-view.tsx:127,282`). CTRE also sells the Kraken X60 as `WCP-0940` (WCP makes it), so order #1008's "CTR Electronics, WCP-0940" is likely correct.
  - The audit's fix (a new `offer` table and `offer_id`) would break the rule "`variants.id` is the key", so it is not taken.
  - There is a real ambiguity: `?v=<sku>` picks the first variant with that SKU (`family-view.tsx:78`). Two vendors with the same SKU can open on the wrong offer. T2 fixes it.
- **A-14 (removing the last admin).** The server already refuses (`admin/settings/actions.ts:147`). Only the UI's self-removal button is left.
- **C-27 (guest cart merge).** It exists (`cart-store.ts`, `readGuestCart`/`stashGuestLines`). Check only the logout case.
- **A-22 (audit log).** `audit_log` exists and `writeSettings` writes to it. What's missing is a page to read it.

**Against user decisions in CLAUDE.md. Not done; listed for the owner:**
- **C-23 ("כולל מע״מ" on every total).** Prices carry no VAT (Nov 11 decision). The rule is to never say a price includes VAT and to show no VAT line.
- **D-01 light theme.** The site is dark only (Nov 14 decision). The contrast fix (AA) and the wrong `colorScheme: "light"` (`layout.tsx:50`) are real and go in T8.
- **L-10 and A-13 (roles: approver, member).** One kind of team account (D11). No role checks.
- **P2-1 (quick order: paste SKUs, BOM upload).** Removed on purpose in Nov 2026. "הזמנה חוזרת" already exists.
- **C-05 and C-06 (home hero with search, kickoff kits).** The home scene was designed with the user on Nov 14, and the "COTS-IL homepage visual rebuild" session owns it. Only on the user's request.

**Confirmed in the code:**
- C-01: the "בלי תוספת" fallback (`page.tsx:152`).
- C-02: "ארבעת הספקים" (`page.tsx:187`).
- C-33: four vendors in `how-it-works/page.tsx:20`, `info-text.ts:170,200`, the catalog meta (`catalog/page.tsx:30`) and the OG image (`opengraph-image.tsx:46`).
- A-01: four labels for one status (`order-status.ts:47,125`, `deliveries/page.tsx:118`, `orders/[id]/page.tsx:92,131`).
- B-1: the open redirect is still open (`validation.ts:9`).
- B-2: the reports still divide by 1.18 (`domain/reports.ts:4`).

## Running now; don't collide

[Speed A: stop the constant repainting](#local_0a057f28-190d-4055-b064-065ed07cdd93) is working on `globals.css`, `home-scene.tsx`, `discovery-strip.tsx`, `vendor-boxes.tsx` and `scroll-parallax.tsx` (branch `claude/speed-paint-5f0259`).
- Wave 1 stays out of those files.
- T8 (which touches `globals.css`) waits until that branch is merged.

## Waves

Sessions in one wave touch different files, so they run at the same time. A wave starts when the one before it has merged.

### Wave 1: P0, trust and correctness

**T1. Honest copy and the go-live checklist** (C-01, L-06, C-02 copy, C-33, C-32, C-34 code part, L-02 banner). Sonnet.
- Home value strip:
  - the price line says what is really true, with no "בלי תוספת";
  - the "ארבעת הספקים" line counts vendors from the DB.
- Vendor names in `/how-it-works`, `DEFAULT_PAGES` (`info-text.ts`), the catalog meta and the OG image come from the DB (`getVendors`), or from a `{{ספקים}}` token in info texts.
- `/contact`, `/returns`, `/privacy`:
  - "כתבו לנו" and "צרו קשר" point at a channel that exists;
  - the "דרכי קשר" heading is hidden while every contact field is empty.
- A go-live checklist on `/admin` (a banner) lists what is missing: contact channel, business name, lead times, payment terms, `RESEND_API_KEY`/`EMAIL_FROM`. Each item links to its settings page.
- *Accept:* no page says "בלי תוספת"; `/about` and `/how-it-works` list all 7 vendors; an empty contact page shows no empty heading; the admin banner lists what is missing.

**T2. Product identity and merges** (C-15 check, L-03, L-04, A-20). Opus.
- Check on the local DB first: which SKU the CTRE Kraken X60 variant has. Report what you find.
- `?v=` and `?vendor=`: resolve by variant id, or by SKU **plus** vendor. The URL the page writes carries the variant id when two offers share a SKU.
- Merge rules (`src/domain/families`):
  - never merge across vendors on title alone. That is how "Timing Belt (HTD 5mm)" and "Aluminum Spur Gear (20 DP)" got CTR Electronics;
  - do merge "Kraken Wire Bundle" with "Kraken Wire Bundle 18"" and "NEO 550" with "REV NEO 550" where the part numbers agree;
  - fold AndyMark's flat "Title - Opt:Val" SDS module list into one family;
  - send low-confidence matches to the grouping report;
  - add Vitest fixtures for each case.
- The nightly sync regroups production, so merging the code is enough. Don't run `npm run regroup` against production without asking.
- *Accept:* the tests cover each named pair; after the next sync, the HTD belt and 20 DP gears show only real vendors, and the Kraken Wire Bundle and NEO 550 appear once with 2 offers.

**T3. Sign-in redirect and reports** (B-1, B-2, A-09, A-10, A-11, A-12). Sonnet.
- B-1: `safeNext` resolves against the origin and rejects `\t \r \n \\`; add tests.
- B-2: revenue is no longer divided by 1.18 in the reports, their Excel export or the labels.
- A-09: under 1 day, show hours; add the median beside the mean.
- A-10: the profit's USD rate defaults to the Bank of Israel rate on the supplier-order date, and the admin can override it.
- A-12: date presets (this month, last month, season Jan–Apr, all).
- *Accept:* the tests pass; the reports page shows a profit without typing a rate.

### Wave 2: P1, one truth on every screen

**T4. One status dictionary** (A-01, A-02, A-03, A-04, A-05, D-07). Opus.
- Every label comes from `src/domain/order-status.ts`: admin tabs, the team page badge and delivery note, `/admin/deliveries`, emails, `/how-it-works`.
- Shipment status is derived: received in full means closed.
- `/admin/deliveries` "ready" includes lines already on an undelivered note.
- A Hebrew plural helper (פריט אחד, 2 פריטים), and "1 פריט, 2 יח׳".
- Tabs: "פתוחות", נמסרו, בוטלו.
- A status palette tied to the dictionary.
- *Accept:* one label for order #1008 on all four screens.

**T5. Counts from one source** (C-02 counts, C-03, A-15, L-05, A-18 labels). Sonnet. Starts after T1, because both touch `page.tsx`.
- One count of families visible to customers serves the home page, `/catalog`, the vendor boxes and the admin categories.
- Admin screens label families and variants.
- Find why AndyMark and WCP both show 1,169 and why every category shows 0.
- *Accept:* the numbers agree; a test proves two vendors' counts come from their own rows.

**T6. Search quality** (C-07, C-08, C-09, C-10, C-11). Opus. Starts after T5, because both touch `lib/catalog.ts`.
- Facet counts follow the query; zero-count chips are hidden.
- The header keeps the query.
- Relevance: exact or prefix title first, in stock first, one server-side order with no client re-sort.
- `OPTION_LABELS` mapping: "motor pinon type" merges into "motor pinion type", and "stagea ratio", "assembled" and "for motor shaft" get Hebrew labels.
- `dir="auto"` truncation on variant summaries.
- *Accept:* "kraken" puts a Kraken motor first; no lowercase English facet names.

**T7. Delivery promise and cart** (C-16, C-18, C-20, C-22, C-24, C-25, C-26, C-27, L-09). Opus. Starts after T2, because both touch `family-view.tsx`.
- Each offer shows its expected arrival in Israel, from the vendor lead times, on the product page, cards and cart. Nothing shows while the lead times are empty.
- Product page: a reason the chosen offer is recommended.
- An add-to-cart toast with "לסל".
- Cart:
  - a preorder note per line;
  - a compact footer with one main button, sign-in after "שליחת בקשה";
  - a shipping line ("יתומחר בהצעה" until the owner sets a rule).
- The floating pill: hidden on desktop where the header cart shows.
- Logout clears the guest copy.
- "נבדק לפני X שעות" next to availability.
- *Accept:* 5 or more lines visible at a 900px height; every product page shows an Israel estimate once lead times are set.

**T8. Accessibility** (D-02, D-01 contrast part, D-03, C-11 remainder, C-12, L-12). Opus. Starts after Speed A, T6 and T7 have merged, because it touches `globals.css` and many components.
- `alt` on every product image and logo; vendor names under the logos.
- `colorScheme: "dark"`.
- Secondary text at AA (4.5:1).
- One `<h1>` per view; hidden routes `inert`.
- `<bdi>` on SKUs and numbers.
- An accessibility statement page (Israeli standard 5568) linked from the footer.
- axe on home, catalog, product page and cart.
- *Accept:* axe shows 0 serious issues on those 4 pages; the statement page is live.

**T9. Admin safety and small fixes** (A-07, A-14 UI, A-17, A-21, C-31). Sonnet. Can run in wave 2 alongside T4, because it touches different files.
- Name validation at signup.
- No "הסרה" on your own row.
- Pending-team card: team number linked to its FIRST page.
- An admin 404.
- A title on every route (`/login`, `/admin/teams`, `/admin/requests`, …).
- *Accept:* every route has its own title; you can't remove yourself.

**T10. Phone and team-flow test** (D-06, P1-10). Sonnet, read-only on the local stack.
- At 360/390/414px: home, store, catalog filters, product page variant picker, cart.
- On the local stack (seed), as a team: create a team, send a request, approve, undo, cancel.
- Writes `docs/TEAM-FLOW-TEST.md` with findings; fixes nothing.
- Runs last in wave 2. Its findings go into wave 3.

### Wave 3: P2, after build-season essentials

- **T11. Variant picker** (C-17): dependent options, availability per chip, a live price range, long lists as a searchable select. Opus. Touches `family-view.tsx`.
- **T12. Admin order page and purchasing** (A-06, A-08): `/admin/orders/<id>`; "to order" grouped by vendor with totals and free-shipping distance. Opus.
- **T13. Admin catalog tools** (A-16, A-18, A-19): one "קטלוג וסנכרון" page; all vendors by default; a dense table; drag order for categories with one save. Sonnet.
- **T14. Shipping rule and quote price lock** (L-07, L-08). Needs the owner's shipping rule first. Opus.
- **T15. Speed-audit bugs** (B-3 to B-11): fixed-price rounding, idempotent reorder, double approve email, settings version check, report time zone, raw errors, `decodeURIComponent`, price sort. Sonnet.
- **T16. Polish** (C-19, C-21, L-13, A-22 view, D-08): Hebrew spec labels, deduped accessories, JSON-LD `PreOrder`, security headers and an RLS review, an audit log page, 2-line titles. Sonnet.

## For the owner (not for any session)

- Business name, legal ID (ח.פ. / עוסק), address and contact channels: `/admin/settings/business`.
- Lead times per vendor and payment terms.
- `RESEND_API_KEY` and `EMAIL_FROM` in Vercel; Supabase production SMTP and the Hebrew sign-in templates (`docs/admin-guide.md`).
- A shipping pricing rule (for T14).
- Whether to state "המחירים לא כוללים מע״מ" (or that VAT does not apply) on prices (C-23).
- Whether an admin may also be a team member (A-13).
- Remove the test teams and people ("or", "rfrr", "ttt", "fff") before launch.
- A lawyer's review of the terms (C-34).

## Progress

| Task | Wave | State | Branch | Notes |
|---|---|---|---|---|
| T1 Honest copy, go-live checklist | 1 | done (Nov 14, 2026) | `claude/t1-honest-copy-c1e128` | vendor names from the DB (`{ספקים}`, `{כתבו לנו}` tokens), go-live banner on `/admin` (`src/domain/go-live.ts`) |
| T2 Product identity, merges | 1 | done | `claude/t2-product-identity-896501` | C-15 a false alarm: CTRE sells the Kraken X60 as WCP-0940. L-03 too: CTRE is on the HTD belts and 20 DP gears only through WCP SKUs it really sells. Fixed: `?v=` + `?vendor=` resolution, supplier switch that reset, title-only cross-vendor merges (now need SKU, part number, price or maker), Kraken Wire Bundle, NEO 550, AndyMark option-in-title listings (SDS, ToughBox), AndyMark options 4-5, WCP wire; `name-only` in the grouping report |
| T3 Sign-in redirect, reports | 1 | done | claude/t3-redirect-reports-c52e81 | B-1, B-2, B-8, A-09, A-10, A-12 (A-11: revenue no longer divided by 1.18, import costs already in the profit) |
| T4 Status dictionary | 2 | not started | | |
| T5 Counts | 2 | not started | | after T1 |
| T6 Search quality | 2 | not started | | after T5 |
| T7 Delivery promise, cart | 2 | not started | | after T2 |
| T8 Accessibility | 2 | not started | | after Speed A, T6, T7 |
| T9 Admin safety, titles | 2 | not started | | |
| T10 Phone and team-flow test | 2 | not started | | last |
| T11–T16 | 3 | not started | | |
| T17 Catalog results bar, columns | 2 | not started | | after T6 |
| T18 Header menus | 2 | not started | | after T6, T7 |
| T19 Footer and info pages | 2 | not started | | before T8 |

## Design review additions (Nov 14, 2026)

Source: `docs/DESIGN-REVIEW-2026-11-14.md` (a second outside review, about layout, buttons, text and images). It was checked against the code, and the user decided the open questions on Nov 14.

**The user's decisions:**
- **Visual style stays:** dark glass, vendor-coloured glows, the current radii and fonts, white-ink logos. Only fix contrast (T8).
- **Product cards:** a bigger, stronger price; the round "+" stays.
- **Home page:** stays exactly as it is, with no layout or visual change and no search chips. Only the copy and count fixes from T1 and T5 apply.
- **Admin:** stays close to how it is now. None of the review's admin redesign (sidebar, table views, bulk actions, settings layout). T12 and T13 stay as planned.

**Wrong in the review:**
- **Type sizes and tap targets.** It was measured at 75% zoom: every size it reports is exactly 0.75× the real token.
  - Caption 13 → "9.75", callout 15 → "11.25", body 17 → "12.75", root 16 → "12".
  - The 44px "+" (`family-card.tsx:185`, `size-11`) → "33×33".
  - The real sizes already meet the 13px minimum, and `npm run design-lint` enforces it.
- **"Add a `/cart` page".** It exists (`src/app/cart/page.tsx`).
- **"Inter in 4 places".** That's on purpose: the home motto's FRC/FTC.

**Against CLAUDE.md, not done:**
- "(כולל מע״מ)" on totals, and the VAT note slot: prices carry no VAT.
- "מחיר סופי בשקלים, כולל משלוח ויבוא": not true, because shipping is priced in the quote.
- Dropping the "FRC / FTC" pill from the logo: it's part of the brand mark.
- Removing the store's "הסתר" toggle and shrinking the store header: both are from the Nov 14 store design.

**Added to existing tasks:**
- **T4:** the order page gets a "next action" box at the top (approve the quote, or pickup details) and a compact timeline: date and time per step, finished steps collapsed, the current step larger. Prices in tables use `tabular-nums`.
- **T6:** all product-card changes go here, so no other task edits `family-card.tsx` at the same time:
  - the price becomes the strongest text on the card (≈18–20px, `font-semibold` or stronger, primary text colour, `tabular-nums`); the "+" stays;
  - the variants line shows only "180 אפשרויות", with no raw option keys;
  - check whether ₪ renders in a different font or size from the digits, and fix it if it does.
- **T7:**
  - cart lines: the trash icon at the line's far end, away from "−";
  - the Undo toast for a removed line shows inside the drawer;
  - "שיתוף הסל" moves to the drawer header;
  - the "לא מחייב" disclaimer appears once per view, next to the main button;
  - the header cart button shows the total beside the count.
- **T9:** on login, "המשך עם Google" comes first, plus one line on why a team account is needed. In the teams admin, "דחייה" becomes a text button, weaker than "אישור".
- **T11 (now "Product page layout and variant picker"):**
  - the SKU chip moves off the photo, under the title (`family-view.tsx:282`);
  - buy-column order: title, SKU and vendor, price, stock and ETA, options, quantity and add, then offers;
  - the buy box stays visible while options are picked;
  - "CAD ותיעוד" becomes a visible secondary button near the price;
  - below the fold, tabs: מפרט, תיעוד ו-CAD, תיאור, מתאים לשימוש עם.

**New tasks (wave 2):**
- **T17. Catalog results bar and columns** (after T6, `catalog-browser.tsx`). Sonnet.
  - One line above the grid: result count, sort and view toggle (sort moves out of the sidebar).
  - 4 columns from 1024px, 5 from 1280px.
  - Removable filter chips at least 32px tall.
  - The vendor tiles stay.
  - *Accept:* at 1440px the first product row starts higher than today; there's no horizontal scroll at 360px.
- **T18. Header menus** (after T6 and T7, `site-header.tsx`, `cart-pill.tsx`). Opus.
  - A "קטגוריות" menu next to קטלוג: 5 groups as columns and their categories, from `content.categoryGroups`.
  - A "ספקים" menu with the vendor logos.
  - "ההזמנות שלנו" visible to signed-in teams.
  - The account chip shows the team name and number instead of an initial.
  - On phones, these go into the existing menu.
  - *Accept:* categories reachable in 1 click from every page; 44px targets; works at 360px.
- **T19. Footer and info pages** (after T1, before T8; footer, `info-text-page.tsx`). Sonnet.
  - The footer in four columns: קנייה, עזרה, העסק, צרו קשר. Business name and ID on the bottom line once they're filled in.
  - A side nav across the info pages.
  - FAQ: a rotating chevron, with the first question open.
  - `/contact` leads with contact buttons (WhatsApp, email, pickup address) for the fields that are filled in.
  - *Accept:* contact buttons first on `/contact`; nothing empty shows while a field is empty.

Ordering in wave 2: T4, T5 and T9 start together. T6 starts after T5. T7 runs alongside T6, since T7 no longer edits `family-card.tsx`. T19 can start at once. T17 comes after T6, T18 after T6 and T7, T8 after T6, T7, T17, T18 and T19, and T10 runs last.
