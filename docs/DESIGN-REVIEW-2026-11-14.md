# COTS-IL — Visual & Interaction Design Review

Nov 14, 2026 · @Harel

## Summary

COTS-IL looks polished but reads like a gaming landing page, not a parts store: text is too small and low-contrast, prices are the weakest element on every card, and the page spends its first screen on a photo instead of search. Fixing type scale, card hierarchy and the header gets \~70% of the improvement.

This review covers layout, buttons, text and images only; data and logic bugs are in the earlier audit doc. Measured on the live site at a 894 px wide viewport (desktop with side panel), 14/11/2026.

**The 10 changes with the biggest effect**

1. **Raise the type scale.** Most body text renders at 9.75 px and 11.25 px; card titles 12.75 px; root font-size is 12 px. Set root 16 px, body 15–16 px, secondary ≥ 13 px.
2. **Make price the hero of each card.** Today price is 11 px grey-blue at the bottom-left corner, smaller than the title and vendor name. Move it under the title, 18 px bold white, with the ₪ sign in the same font.
3. **Replace the round glowing "+" with a labelled button** "הוספה לסל" (or a quantity stepper), placed next to the price.
4. **Search in the hero, smaller photo.** Hero is \~400 px of robot photo with no action; put the search field and 4 example chips there and cut the photo to a background band.
5. **Show categories in the header.** Categories are hidden inside the search dialog; add a "קטגוריות" menu next to קטלוג.
6. **One cart entry point.** Remove the floating cart pill (bottom-left) that covers cards and chips; keep the header icon with count + total.
7. **Light theme by default, dark as an option.** Secondary text (#A3AED6 on #070D22) and blue-on-navy links fail at small sizes.
8. **Calmer surfaces.** Drop glows, fanned image collages and per-card gradients; use flat cards with a 1 px border, one accent blue, one radius.
9. **Cart drawer: items first.** Footer currently takes \~70% of the drawer height; make it one sticky row (total + "לשליחת בקשה").
10. **Variant picker as selects.** Chip walls of 20+ options (EVO Shifter) push the price and add-to-cart off-screen; use dropdowns with availability and keep the buy box sticky.

## Design system: what's there and what to set

The site has no single set of design tokens: six corner radii, three font families, and a dozen translucent navy backgrounds were measured on the home page alone. Define the tokens below once (CSS variables / Tailwind theme) and replace ad-hoc values.

**Measured today vs proposed**

| Token | Today (measured) | Proposed |
| --- | --- | --- |
| Root font size | 12 px | 16 px |
| Body / secondary text | 12.75 px / 9.75 px (69 elements at 9.75) | 16 px / 14 px; never < 13 px |
| Type scale | 9.75, 11.25, 12.75, 15, 19, 24, 34 px | 13 · 14 · 16 · 18 · 22 · 28 · 36 px |
| Fonts | System stack (`-apple-system, SF Hebrew, Segoe UI, Heebo`), Inter in 4 places | **Heebo** (or Rubik/Assistant) first for Hebrew + Latin, loaded via `next/font`; tabular numerals for prices/SKUs; mono only for SKUs |
| Weights | 400, 500, 600, 650, 800 | 400 body, 600 labels/titles, 700 prices & H1 |
| Corner radius | pill, 22, 18, 12, 9, 4.5 px | 8 px controls, 12 px cards, pill only for chips/badges |
| Accent | #0018E0 buttons + glow, #3B5BFF / #6E85FF variants | One brand blue (e.g. #2346FF) with hover/pressed shades; no glow |
| Surfaces | \~12 translucent navies (rgba(7,13,34,.78/.85/.88), …) | Light: #FFFFFF page, #F5F7FB section, #E4E8F0 border. Dark: #0B1020 page, #121A2E card, #22304D border |
| Text colours | #F1F4FF primary, #A3AED6 secondary, #A3B3FF links | Light: #0E1424 / #4A5570 / brand blue links. Dark: #EEF1FA / #B4BDD6 (≥ 4.5:1) |
| Status colours | green dot, orange dot, amber, red tints, ad hoc | success #16A34A, warning #D97706, danger #DC2626, info = brand; each with a text label, never colour alone |
| Spacing | mixed | 4-pt scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 |
| Shadows / glow | glow on buttons, search, cards | One subtle elevation for popovers/drawers only |

**Buttons — three kinds only**

| Kind | Use | Look |
| --- | --- | --- |
| Primary | One per view: הוספה לסל, שליחת בקשה, אישור הצעה | Solid brand blue, white text, 44 px tall, 8 px radius, text label (icon optional) |
| Secondary | שיתוף הסל, הדפסה, סינון, Google | 1 px border, transparent fill, same height |
| Text / danger | ביטול, הסרה, נקה הכל | Text only; danger in red with confirm |

Rules: minimum hit area 44×44 px (cards' "+" buttons are 33×33 today); no icon-only primary actions; primary sits at the end of the reading path (left side in RTL, bottom of a card or form).

**Images**

- Product photos come from vendors with different backgrounds (white, grey, transparent, lifestyle). Put every product image on the same light tile (#F5F7FB) with `object-fit: contain` and 12 px padding — the current grey tile works; keep it in both themes.
- Use a fixed 1:1 ratio on cards and 4:3 on the product page; never let images overflow their card (the category collages do).
- Placeholder for missing images (seen on SDS MK4i under AndyMark): a neutral part icon + vendor name, not an empty box.
- Alt text = product name; vendor logos alt = vendor name.
- Vendor logos: render on a white rounded chip so dark/red logos (AndyMark, REV, CTR) keep their colours in both themes.

**Icons**: keep one outline set (the current Lucide-style), 20 px, 1.75 stroke; pair every icon in navigation with a text label.

## Header and global navigation

The header has the right pieces but the wrong weights: the search bar is huge while categories are invisible, "כניסה" is a faint text link, and the cart total lives in a separate floating pill.

**Today (right → left, RTL):** logo + "FRC / FTC" chip · "קטלוג" text link · search field (\~50% width, glowing, "Ctrl K" hint) · cart icon with count · "כניסה" (or an "H" avatar when signed in). Floating cart pill bottom-left on every page. Admin has no cart icon at all.

**Proposed (desktop, right → left):**

```
[COTS-IL logo] [קטגוריות ▾] [ספקים ▾] [ 🔍  חיפוש מוצר, מק״ט או ספק ........ ] [ההזמנות שלנו] [כניסה / קבוצה ▾] [🛒 2 · ₪1,212]
```

| Slot | Change | Why |
| --- | --- | --- |
| Logo | Drop the "FRC / FTC" chip from the logo; move the FRC/FTC choice into a persistent program toggle in the catalog filters (or the account menu). | The chip looks clickable but isn't a control; it adds noise to the brand mark. |
| קטגוריות | New mega-menu: 5 groups as columns, 16 categories as links, one image per group. | Today categories appear only inside the search dialog or after scrolling home. |
| ספקים | Dropdown with the 7 logos. | Vendor stores are a main entry point; now reachable only from home. |
| Search | \~40% width, no glow, keep the Ctrl K hint, keep the query after submit. | Keeps prominence without dominating. |
| ההזמנות שלנו | Visible link for signed-in teams. | The order page is the main reason a team returns. |
| Account | Signed out: secondary button "כניסה" (bordered). Signed in: team name + number, not an initial ("H"). | A faint link is easy to miss; "H" doesn't say which team you act as. |
| Cart | Icon + count + total in the header; remove the floating pill on desktop. | One place to look; pill overlaps product cards and variant chips. |
| Admin | A slim "מצב ניהול" bar with a link back to the shop; keep the shop header. | Today admins lose the cart and switch context without a cue. |

**Mobile header:** logo · search icon (opens full-screen search) · cart with count; a hamburger holds categories, vendors, orders, account. Show a slim sticky "סל · ₪X" bar at the bottom only on mobile and only when the cart is non-empty.

**Footer:** today 8 links in two rows and a bare "COTS-IL". Make it four columns — קנייה (קטלוג, ספקים, איך זה עובד), עזרה (שאלות נפוצות, משלוח, החזרות), העסק (מי אנחנו, תנאים, פרטיות, הצהרת נגישות), צור קשר (WhatsApp, email, pickup hours) — plus business name and ח.פ. on the bottom line.

## Page by page

Every page should answer three questions within the first screen: where am I, what can I do here, and what is the one main action. Most pages answer the first two; few make the main action obvious.

### Home

Today the home page is 9 stacked sections (hero, vendors, גלו עוד, trust strip, categories, איך זה עובד, "כל הפרטים", update-date bar, למה דרך COTS-IL); two of them (איך זה עובד, למה) are 4-card rows with the same look and overlapping messages.

**Proposed order:**

1. **Hero (≤ 320 px):** headline "כל החלקים ל-FRC ו-FTC, בהזמנה אחת בשקלים", a large search field, 4 example chips, and three facts inline (7 ספקים · X מוצרים · משלוח מרוכז). Robot photo as a dimmed background band, not a centre-stage image.
2. **How it works — one compact row** of 4 numbered steps with icons, merged with the "why" points (one line each). Link "הסבר מלא".
3. **Shop by category:** 5 group tiles, each with ONE clean image (not a fanned collage that overflows the card) and its 3–4 categories as links underneath; no chevron expanders.
4. **Shop by vendor:** 7 logo tiles in one row (logo on white chip, name, count). Drop the 4 thumbnails per vendor — they are random and add 28 images.
5. **Popular / kickoff kits:** one carousel of products Israeli teams order most.
6. **Footer** (as in the header section).

Remove: the standalone "כל הפרטים" link floating left, the full-width "המחירים עודכנו…" bar (move to footer as small text), the trust strip with tiny grey checkmarks (merge into hero facts).

### Product card (catalog, search, carousels)

| Element | Today | Proposed |
| --- | --- | --- |
| Order top→bottom | image · vendor · title · stock dot · (price + "+" at the bottom corners) | image · title (2 lines max) · **price** · stock + ETA · vendor logo-chip · action row |
| Price | 11.25 px, light blue, bottom-left, ₪ smaller than digits | 18 px bold, primary text colour, right under the title; "החל מ-" as a small prefix |
| Add to cart | 33×33 px round glowing "+" at bottom-left, far from the price | Full-width secondary button "הוספה לסל" (becomes − 1 + stepper once added); for families: "בחירת אפשרות" |
| Variants line | "…a ratio, stageb ratio 180 אפשרויות" truncated from the wrong side | "180 אפשרויות" only, as a small badge on the image |
| Multi-vendor | "WCP, CTR Electronics" plain text | Small stacked vendor logos + "2 ספקים" |
| In-cart state | "בסל: 1" badge top-right of image (vendor page only) | Same badge on every card everywhere |
| Hover | none beyond cursor | Lift border colour; show a second image if available |

### Catalog and search results

- **Layout:** filters on the right (correct for RTL), results on the left. Keep. But the vendor tiles (6 large cards, \~80 px tall) plus group chips push results \~330 px down. Collapse vendors into the filter sidebar as checkboxes with logos; keep the group chips as one row of tabs.
- **Result count + sort + view toggle** on one line directly above the grid: "82 תוצאות ל-kraken · מיון: רלוונטיות ▾ · ▦ ☰". Today sort is inside the sidebar, far from the grid.
- **Active filters** as removable chips under that line (exists as "חיפוש: kraken × / נקה הכל" — keep, make chips 32 px tall).
- **Toggle "רק מה שזמין אצל הספק"** is the first control; good. Make it default ON for search results.
- **Density:** 3 columns at \~900 px with tall image tiles; go to 4 columns ≥ 1024 px and 5 ≥ 1280 px; list view should show SKU, vendor, stock, price, qty stepper in one row (for BOM-style buying).
- **"טעינת עוד מוצרים"** button: fine; add "24 מתוך 284" progress bar above it (text exists, make it visual).
- **Empty state** ("לא מצאנו מוצרים") is good; promote "לא מצאתם? שלחו לנו קישור לחלק" to a primary button.

### Vendor store (`/v/<vendor>`)

- Header card (logo, tagline, count, external link, in-store search) is clear; reduce its height \~30% and put the store search on the same row as the logo.
- "הכי מבוקשים" has a "הסתר" button — remove it; hiding a section is not a shopper task.
- Replace "גלו עוד" random items with the vendor's categories grid; show the full catalog of that vendor (filters) on the same page instead of linking out.

### Product page

Today (desktop): image right (\~400 px, sticky), left column = vendor links, title, "ספק" offer cards, price box with stepper + "הוספה לסל", disclaimer, "איך נקבע המחיר?". The SKU sits as a chip on the image corner.

- **Order in the buy column:** title → SKU (copy button) + vendor → **price (28 px)** + VAT note → stock + ETA → variant selects → qty + "הוספה לסל" → offer comparison (only if > 1 vendor) → one-line "לא מחייב, תקבלו הצעת מחיר".
- **Move the SKU off the image** — overlaid text competes with the product and is hard to select.
- **Offer cards:** today two equal cards with identical price — looks like a choice with no difference. Show a compact table row per vendor (price, stock, ETA, "נבחר" radio), and pre-select the best one.
- **Variants:** dropdowns (or segmented control when ≤ 4 options), labels in Hebrew, unavailable options greyed with "לא זמין". Keep the buy box sticky so price and button stay visible while choosing.
- **Below the fold:** tabs "מפרט · תיעוד ו-CAD · תיאור · מתאים לשימוש עם" instead of one long column; make "CAD ותיעוד" a visible secondary button near the price (engineers look for it first).
- **Gallery:** thumbnails under the image are fine; add swipe on mobile and keep the zoom button bottom-left.
- **Add-to-cart feedback:** a toast "נוסף לסל · לסל →" and a cart-count bump; today the only change is the button turning into a stepper with a tiny "בסל" label.

### Cart drawer

- **Height split:** items get the scroll area; footer = one sticky block: "סה״כ משוער ₪1,212 (כולל מע״מ)" + primary "לשליחת בקשה להצעת מחיר".
- **Sign-in after the click:** the email field, "שליחת קוד כניסה", "המשך עם Google" and two disclaimers currently sit inside the cart. Move them to a step that opens after "לשליחת בקשה".
- **Line item:** image, title (2 lines), SKU, vendor chip, stepper, line total. The trash icon sits next to the stepper — move it to the line's far end so it isn't hit while pressing −.
- **Undo toast** after removing appears over the page outside the drawer (seen at mid-screen); show it inside the drawer at the removed line's place.
- **Vendor groups:** keep, with a subtotal per vendor; add a "שיתוף הסל" secondary button in the header of the drawer, not between items and total.
- Add a full `/cart` page for large carts (BOMs of 40+ lines) with a table layout.

### Login / signup

- Clean, centred card — good. Make "המשך עם Google" first (most teams use Gmail), then email code; hide "כניסה עם סיסמה" behind a small link (it is a `<details>` disclosure today, fine).
- Signup stepper "1. דו״אל 2. הקבוצה": show it as a real progress indicator, and explain in one line why a team account is needed ("כדי לשלוח בקשה ולראות הזמנות").
- The page has a large empty area; add the 4-step "איך זה עובד" as a side column on desktop.

### Team order page (`/orders/<id>`)

- Strong base: title, status badge, print button, contact block, 8-step timeline, quote table.
- Put the **next action** at the top in a coloured box: "הצעה מחכה לאישורכם · \[אישור ההצעה\] \[בקשת שינוי\]" or "מוכנה לאיסוף · כתובת · שעות".
- Timeline: 8 steps all labelled with the same date; show date+time and collapse finished steps into "הושלמו 6 שלבים"; make the current step larger.
- The badge says "מוכנה לאיסוף" while the line item says "מוכנה למסירה" and the delivery note "בהכנה" — one label (see copy section).
- Price column alignment: numbers left-aligned in RTL tables with tabular figures so ₪ amounts line up.

### Info pages (FAQ, shipping, returns, terms, privacy, about, contact)

- All use one narrow text column with H1 + H2s — fine. Add a left side-nav listing all info pages so users can jump between them.
- FAQ accordions use "+" glyphs at the line end with no rotation/state; use a chevron that rotates and open the first question by default.
- Contact page must lead with contact cards (WhatsApp button, email, pickup address with map link, hours), not prose.

## Admin screens

The admin is a work tool, so it should be denser, lighter and more table-driven than the shop; today it reuses the shop's dark glowing cards, which makes long operational pages tiring.

**Navigation**

- Today: a pill-tab row of 8 sections (כל ההזמנות, הזמנות ספקים, מסירות, דוחות, קבוצות, בקשות חלקים, הגדרות), then a second pill row of 8 settings tabs on settings pages. Two rows of identical-looking pills read as one.
- Proposed: a right-side vertical sidebar (RTL) grouped as **תפעול** (הזמנות, רכש, מסירות, בקשות חלקים), **לקוחות** (קבוצות), **קטלוג** (מוצרים, קטגוריות, ספקים, סנכרון, תמחור), **עסק** (דוחות, פרטי העסק, תוכן האתר, מנהלים, מערכת), with a red count badge on items needing action.

**Orders list (`/admin`)**

- The 8 status stat-cards across the top are equal-sized, so "0" states take the same space as the one that needs action. Make them a compact segmented filter; highlight only the "מחכה לך" states in amber.
- Order card: team name is the title (good), status chip top-left, and the primary action "סימון כנמסר" bottom-left. Keep the action on the card, but add the action's label to the status ("מוכנה למסירה — לסמן כנמסר").
- Switch to a table view by default (order #, team, date, items, total, status, next action) with the card view optional.
- Expanded order: today one very long column (details, quote, items, supplier order, shipments, receiving, delivery). Use a 2-column layout: left = quote table and items; right = a sticky "פעולה הבאה" panel + timeline + contact.

**Purchasing, deliveries, requests** — good empty-state sentences. Put each list in a table with checkboxes for bulk actions ("הזמנה מ-WCP ל-5 פריטים נבחרים", "סימון 3 תעודות כנמסרו").

**Reports** — KPI tiles (מכירות, רכש, רווח) use the same visual weight as the explanatory note. Make 3–4 KPI tiles with large numbers, a sales-by-week chart, then the tables; put "הדפסה / PDF" and "ייצוא ל-Excel" as secondary buttons in each table header (they already are — align them to one side consistently).

**Teams** — the page opens with "סנכרון קטלוג" vendor cards that have nothing to do with teams. Move them; start with "בקשות הרשמה ממתינות" (approve/reject buttons: green primary "אישור", text-red "דחייה"; today דחייה is a red outlined pill as strong as אישור), then the teams table.

**Settings**

- Business details: long single form with 7 vendors × min/max lead-time inputs; use a compact 3-column table (vendor, min, max). Sticky "שמירה" bar at the bottom that appears only when something changed.
- Pricing: the live preview is excellent — keep it next to the inputs (side by side) so the effect is visible while typing.
- Products: 4-up image grid of washers is a poor admin view; default to a dense table (image 40 px, name, vendor, SKU, price, stock, hidden toggle) with inline edit. The vendor tab strip scrolls horizontally with a visible scrollbar; use a dropdown.
- Categories: 16 stacked cards each with name, group radio set, image field and its own "שמירה". Replace with one sortable table and a single save.
- Content: FAQ editor shows raw text + preview; good. Put preview to the side, not below.
- System: good "חיבורים" status chips (מוגדר / לא מוגדר). Promote any "לא מוגדר" to a banner at the top of every admin page.

## Copy and microcopy

The Hebrew is clear and friendly; the issues are repetition (the "לא מחייב" disclaimer appears 3–4 times per page), mixed status names, and raw English vendor strings in the UI.

| Where | Today | Proposed |
| --- | --- | --- |
| Product page, cart, store footer | "הוספה לסל ושליחת בקשה לא מחייבות תשלום. תקבלו הצעת מחיר לאישור." on every view | Once, next to the primary cart button: "בלי תשלום עכשיו — תקבלו הצעת מחיר" |
| Home trust strip | "מחיר הספק בש״ח, בלי תוספת" | "מחיר סופי בשקלים, כולל משלוח ויבוא" |
| Hero subtitle | "כל החלקים הרשמיים, משלוח מרוכז ומק״טים מדויקים במקום אחד." | "מ-AndyMark, WCP, REV ועוד — סל אחד, מחיר בשקלים, מסירה בישראל." (concrete names sell) |
| Stock | "זמין אצל הספק" / "בהזמנה מראש" / "לא זמין כרגע" | Keep, plus ETA: "זמין · מגיע תוך 2–3 שבועות" |
| Order status (one dictionary) | מוכנה למסירה / מוכנה לאיסוף / ממתינה למסירה / בהכנה | Team: "מוכנה לאיסוף" (or "בדרך אליכם" for delivery). Admin: "מוכנה למסירה". Nothing else. |
| Admin tab | "מחכה להצעה שלך" | "לתמחר" (short verbs for admin queues: לתמחר, להזמין, לקלוט, למסור) |
| Counts | "1 פריטים", "1 מוצרים" | "פריט אחד", "מוצר אחד" (Hebrew plural helper) |
| Facets / variant labels | "for motor shaft", "stagea ratio", "motor pinon type", "assembled", "layout" | "לציר מנוע", "יחס שלב א׳", "סוג פיניון", "מורכב", "פריסה"; values stay in English |
| Vendor taglines | "כלים, אלקטרוניקה וחיוט ופרופילים ומבנה" (auto-joined) | Hand-written: WCP "תיבות הילוכים, סוורב ופרופילים"; REV "מערכת MAX ומנועי NEO"; CTR "Kraken, Talon וחיישנים" |
| Cart sign-in | "זו בקשה ולא הזמנה: הספק הישראלי יבדוק…" + "כדי לשלוח צריך חשבון קבוצה…" | One line on the sign-in step: "נכנסים עם המייל של הקבוצה כדי לשלוח את הבקשה" |
| "הספק הישראלי" | Used for the business itself, while "ספק" also means WCP/REV | Call the business "COTS-IL" or "אנחנו"; reserve "ספק" for vendors |
| Product page | "נמכר אצל" + links, then "ספק" label above cards | Single label "בחרו ספק" above the offer rows; drop the duplicate line |
| Page titles | "COTS-IL" on /login, /admin/teams, /admin/requests | "כניסה \| COTS-IL", "קבוצות \| ניהול", … |

**Numbers and currency:** the ₪ sign renders smaller and in a different font than the digits (seen on cards). Format with `Intl.NumberFormat('he-IL', {style:'currency', currency:'ILS', maximumFractionDigits:0})`, one font, tabular figures; the site already uses RLM marks — keep them consistent.

## Implementation checklist

Do the system first (tokens, type, buttons) so every page change after it is small; then pages in traffic order. Run this after the P0 data fixes from the audit doc.

**Instructions for the implementing session:** find where the theme lives (Tailwind config / CSS variables / globals) before editing; replace values with tokens rather than restyling page by page. One PR per task. After each deploy, screenshot the page at 1440, 1024 and 390 px in both themes and compare with the acceptance check. Keep RTL logical properties (`margin-inline-start`, `ps-`/`pe-`) — never `left`/`right`.

### Phase 1 — design system

- [ ] **DS-1 Tokens.** Colour, radius, spacing, shadow tokens for light + dark; remove glows. *Accept:* no hard-coded rgba navies left in components (grep); 3 radii in use.
- [ ] **DS-2 Type.** Root 16 px, scale 13–36 px, Heebo via `next/font`, tabular numerals. *Accept:* no visible text < 13 px; Hebrew renders in Heebo on Windows and macOS.
- [ ] **DS-3 Buttons.** Primary / secondary / text components, 44 px min height. *Accept:* every action uses one of the three; no icon-only primary actions.
- [ ] **DS-4 Light theme default + toggle.** Respect `prefers-color-scheme`; fix the `color-scheme` meta. *Accept:* WCAG AA contrast on home, catalog, PDP, cart in both themes (axe/Lighthouse).
- [ ] **DS-5 Price component.** One `<Price>` (₪ via `Intl.NumberFormat`, "החל מ-" prefix, VAT note slot). *Accept:* ₪ sign same font/size as digits everywhere.

### Phase 2 — shop

- [ ] **SH-1 Header + footer** as specified (categories mega-menu, vendors menu, account with team name, cart with total; remove floating pill on desktop). *Accept:* categories reachable in 1 click from any page.
- [ ] **SH-2 Product card** new anatomy (title → price → stock/ETA → vendor chip → "הוספה לסל"). *Accept:* price is the largest text on the card; add button ≥ 44 px tall.
- [ ] **SH-3 Home** new section order; hero with search; single images per category group. *Accept:* search field visible above the fold at 1440×800 and 390×844; page ≤ 6 sections.
- [ ] **SH-4 Catalog/search** vendors into sidebar, results bar (count · sort · view) above grid, 4–5 columns on wide screens, dense list view. *Accept:* first product row starts ≤ 260 px from the top at 1440 px.
- [ ] **SH-5 Product page** buy-column order, SKU off image, offer rows, variant selects, sticky buy box, tabs below, add-to-cart toast. *Accept:* on EVO Shifter, price and add button stay visible while choosing all options.
- [ ] **SH-6 Cart** items-first drawer, sign-in as next step, trash at line end, undo inside drawer, `/cart` page. *Accept:* ≥ 5 lines visible at 800 px height; sign-in fields not shown until "לשליחת בקשה".
- [ ] **SH-7 Order page** next-action box, compact timeline with date+time, one status label. *Accept:* the current step and next action are visible without scrolling.
- [ ] **SH-8 Info pages** side-nav, contact cards, FAQ chevrons. *Accept:* contact page shows WhatsApp/email buttons first.
- [ ] **SH-9 Copy pass** per the copy table (disclaimer once, Hebrew facet labels, plural helper, page titles). *Accept:* no lowercase English option names visible; no "1 פריטים".
- [ ] **SH-10 Mobile pass** at 360/390/414 px: hamburger menu, full-screen search, filter bottom sheet, sticky add-to-cart and cart bar. *Accept:* no horizontal scroll; all tap targets ≥ 44 px.

### Phase 3 — admin

- [ ] **AD-1 Sidebar navigation** with groups and action badges. *Accept:* one nav system; settings no longer a second pill row.
- [ ] **AD-2 Orders table view** + 2-column order detail with sticky next-action panel. *Accept:* any order's next action reachable in 1 click from the list.
- [ ] **AD-3 Dense tables** for products, categories (sortable, single save), teams, purchasing, deliveries with bulk actions. *Accept:* products table shows 25+ rows per screen at 1440 px.
- [ ] **AD-4 Settings forms** compact lead-time table, sticky save-on-change bar, side-by-side previews. *Accept:* unsaved-changes guard on every settings page.
- [ ] **AD-5 Config banner** for any "לא מוגדר" integration on all admin pages.

**Not verified in this review:** true phone-width rendering (browser couldn't be resized) and the signed-in team screens other than the order page — SH-10 and a team walkthrough should be done with real devices.
