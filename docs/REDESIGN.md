# COTS-IL Redesign Plan

Nov 5, 2026 · @Harel

## Summary and how to use this plan

North star: a team gets from "I need this part" to a sent order in as few clicks as possible — 3 for a part they know, 1 for a repeat order — in a calm, modern, Apple-like interface. Every screen is judged against the click budget in the design section; a feature that adds a click without removing a doubt gets cut.

The data layer is already solid (4,163 products, 4 suppliers, images, availability checked 04/11). What changes is the presentation, variant grouping, the ordering path and the trust content that lets a team buy without asking questions first.

How to run it in Claude Code:

1. Paste the whole doc into the repo as `docs/REDESIGN.md` and tell Claude Code to read it first.
2. Run one phase per session (section 7 has a ready prompt for each). Ask for a plan before code on phases 2 and 4.
3. After each phase, run the acceptance checks in section 8 and deploy a Vercel preview before merging.

Not covered: saad-robot.com blocks automated access, so it is not benchmarked here. Add screenshots of it to the repo if you want it compared.

## Benchmark against the supplier stores

The suppliers win on navigation depth, variant grouping and ordering speed; cots-il wins on multi-supplier search and local pricing. The table compares what each site does today.

| Area | AndyMark | CTRE | Thrifty Bot | cots-il today | Target for cots-il |
| --- | --- | --- | --- | --- | --- |
| Navigation | Mega menu: Mechanical, Electrical, FRC, FTC, each with 4–6 sub-groups | Mega menu by product family + Software & Docs + Info & Support | Short menu: Motion, Structural, Electrical, Mechanism Kits, Newest | 3 links: Catalog, Login, Signup | Category mega menu + persistent search + cart icon |
| Home page | Rotating banners (season kickoff, new kits), featured products, new-by-year | Hero statement, collection tiles with photos, best-seller carousel, engineering support CTA | Banner carousel, featured collection tiles, short About | Hero + search, text-only category and supplier tiles | Hero + search, image tiles, "how it works", season picks, trust strip |
| Product cards | Image, price, SKU, short spec excerpt, "N options available", Quick shop | Two images (hover swap), price "From $X", Add to cart / Choose options | Image, price | Image, supplier, title, ₪ price, availability + check date | Add: variant count, "from" price, add-to-cart, FRC/FTC badge |
| Variants | One product page, options selected inside | One page, options inside ("From $73.49") | One page per product | Each size is its own card (gears: 405 cards over 17 pages) | Group by product family, pick size/bore on the page |
| Product page | Description, Specifications and Documentation tabs, SKU | Specs, docs links, CAD on GitHub | Description, docs site | One image, SKU/price table, scraped description ("This Page is for Reference Only") | Gallery, spec table, CAD/STEP + docs links, related parts |
| Season content | Current-game collections (REBUILT 2026, BIOBUZZ FTC) | Best sellers, bundles | Kitbot + field items for 2026 | None | "Season 2027 picks" + kickoff bundles |
| Support / trust | FAQ, purchasing, warranty, returns, shipping, contact | Shipping, warranty, international orders, FAQ, phone + address | Purchase orders, stock status, return policy | One line on VAT and shipping | How-it-works, FAQ, lead times, fees, contact/WhatsApp, policy pages |

WCP was not read directly (it blocks automated access); CTRE's store sells the WCP range and shows the same pattern. Sources: [AndyMark](https://andymark.com), [CTRE store](https://store.ctr-electronics.com), [The Thrifty Bot](https://www.thethriftybot.com), [cots-il](https://cots-il.vercel.app), all read 2026-11-05.

## Current-state audit

The foundation is good; most problems are fixable without touching the data pipeline. Issues are ordered by impact.

| # | Issue | Where | Fix |
| --- | --- | --- | --- |
| 1 | Every size or bore is a separate card, so browsing is a wall of near-duplicates | Catalog (gears: 17 pages) | Group SKUs into product families (section 6) |
| 2 | Guests can't add to cart, yet the hero says signup is needed only to order | Product page shows "need a team account" box | Guest cart in localStorage; ask for account only at "send quote request" |
| 3 | Scraped descriptions are often junk ("This Page is for Reference Only") | Product page | Hide placeholder text; show spec table instead |
| 4 | Page title is the site name on product pages | `<title>` on /catalog/\[supplier\]/\[handle\] | Per-product title, description and OG image |
| 5 | Main content streams in behind "טוען…" | Home, catalog, product | Render server-side; skeleton cards, not a text loader |
| 6 | No cart icon, mega menu or search in the header | Global header | New header (section 5) |
| 7 | No explanation of fees, lead time, consolidation, who the Israeli supplier is | Everywhere | How-it-works page + trust strip + FAQ |
| 8 | Filters are dropdowns; no spec facets (DP, bore, pitch, width) | Catalog | Side filter panel with spec facets per category |
| 9 | Pagination is only "next" | Catalog | Numbered pages or load-more; keep page in URL |
| 10 | Card images have empty alt text | Catalog grid | alt = product title |
| 11 | 404 page is the default English Next.js page | Global | Hebrew 404 with search + popular categories |

What already works and should stay: RTL with LTR spans for part names, ₪ prices with VAT, the availability line with its check date, category and supplier counts, the 16-category taxonomy, and the link out to the supplier's page.

## Click budget, interaction and visual design

The fewest clicks wins: a known part goes from search to a sent order in 3 clicks, a repeat order in 1. Typing doesn't count as a click; every tap, page load, dialog and confirm does.

### Click budget

| Task | Target | How |
| --- | --- | --- |
| Add a part you know | 1 click | Type in search, press "+" on the result; it lands in the cart without leaving the page |
| Add a part with options (e.g. 36t, 1/2" hex) | 2 clicks | Option chips open inline on the card; tap the size, tap "+" |
| Send the order (returning team) | 1 click | "Send quote request" in the cart sheet; team, contact and delivery are remembered |
| Send the order (first time) | 1 click + one short sheet | Team number auto-fills the team name; sign-in by email magic link or Google, no password |
| Order again | 1 click | "Order again" on the home page and in the order list |
| Approve the quote | 1 click | Approve button inside the email/WhatsApp message, no login screen |

Rules that keep the budget:

- Never navigate away to add to cart. Add, change quantity and remove all happen in place.
- No confirm dialogs. Every destructive action shows a 5-second "Undo" toast instead.
- No required field the app can infer: team name from number, delivery address from the team's last order, program (FRC/FTC) from the team number.
- Remember everything: last team, last filters, quantities, open cart, across devices once signed in.
- One primary button per screen, always in the same place (bottom of the cart sheet).

### Interaction patterns

- Spotlight-style search: `/` or `Ctrl/⌘K` anywhere, or tap the search bar. Results appear while typing, with photo, price and a "+" button. Typing `x4` after a result sets quantity 4. Arrow keys + Enter add the highlighted result.
- The "+" button morphs into a `− 1 +` stepper on tap, the item flies into the cart pill, and the phone gives a light haptic tap.
- A cart pill floats at the bottom (mobile) or bottom-end corner (desktop) with item count and ₪ total. Tap opens a bottom sheet (mobile) or side sheet (desktop) with lines, total and the one primary button.
- Optimistic UI: the cart updates instantly and syncs in the background. Page changes use view transitions, never a blank reload.
- Sheets, not pages, for sign-in, options and the cart, so the shopper never loses their place.

### Visual language (COTS-IL Blue & White Fade)

Calm, spacious chrome with the product photo as the hero; dense data appears only where engineers look for it (spec table, list view). Since Nov 6, 2026 the look is the **COTS-IL** brand on a light-only **Blue & White Fade** palette, after FRC Team 1690's royal cobalt blue and crisp white: soft atmospheric fades from ice blue to white, cobalt hairlines, and tactile buttons that press like a social app's. It replaces the earlier Apple-like greys and the dark theme.

Why light only: supplier product photos are shot on white. On a white and ice-blue page they look native; on a black page they turn into glowing white boxes. So there is no `prefers-color-scheme: dark` override, `color-scheme` is always `light`, and no component uses Tailwind's `dark:` variant.

| Element | Spec |
| --- | --- |
| Font | System stack first: `-apple-system, "SF Pro Text", "SF Hebrew", "Segoe UI", Heebo, sans-serif` (real SF on Apple devices, Heebo fallback). Mono for SKUs: `ui-monospace, "SF Mono", "JetBrains Mono"` |
| Type scale | 48/40 hero, 28 page title, 20 section, 17 body, 13 caption; headlines weight 600, tight tracking (−0.02em) |
| Brand | The name is **COTS-IL** everywhere: `<title>`, metadata, header, emails, pages. Never "פורטל רכש FIRST". The header mark is a royal-blue `.btn-brand` badge (`size-9 rounded-xl`), the word COTS-IL in an 19px extrabold navy-to-cobalt gradient inside `<Ltr>`, and a small "FRC / FTC" pill from `sm` up |
| Colour (light only) | Background #F6F9FF, surface #FFFFFF, subtle #ECF3FF (hover #DCE8FF), text #0B1528 (deep navy-slate), secondary #52658A (cool cobalt-slate, never a dead grey), hairline #D8E4FA, brand #1D4ED8 (Orbit royal cobalt; strong #1E3A8A, soft #DBEAFE), photo tile #F2F7FF; status green #1E8E3E / amber #B26A00 / red #D70015. No dark theme |
| Page backdrop | `body` fades from ice blue at the top to the background: `radial-gradient(110% 520px at 50% 0%, #D6E6FF, #EBF3FF 48%, transparent)` over #F6F9FF. Browser `theme-color` #EBF3FF |
| Cards | `.card-surface`: a white-to-#F9FBFF vertical fade, radius 18, a 1px blue hairline drawn inside plus a soft cobalt-tinted shadow; on hover lift 2px + `shadow-lift` |
| Photo tiles | `.tile-fade`: a white-to-#EEF4FF radial fade with a #E3EDFF inner hairline. Show the real product thumbnail wherever one exists |
| Buttons | Pill shape (radius 980), 44px tall. The one primary action uses `.btn-brand`: a #2563EB→#1D4ED8 fade, white text, a top highlight and a blue glow, brightens on hover and springs to 96% on press. Everything else is plain text or a soft white pill (`bg-white/90 hover:bg-subtle border border-line shadow-2xs`) |
| Header | Sticky, translucent white with `backdrop-blur` (frosted glass), 52px tall, hairline bottom border. Search, cart and account sit in soft white pills |
| Motion | 200–300 ms ease-out for fades, spring for sheets and the stepper; all motion off under `prefers-reduced-motion` |
| Icons | Thin line icons (Lucide), 20px, never as the only label on a primary action |
| Spacing | 8px grid; generous page margins (24 mobile, 48+ desktop); max content width 1200 |

Anti-"AI slop" guardrails:

- Never join metadata with middle dots (`·`). Use commas (`, `) or separate pill badges.
- Never render a dark grey empty box with a tiny icon in its corner. Placeholders and empty states use soft blue-to-white vertical or radial fades, a subtle cobalt hairline and, where there is one, a real product thumbnail.
- No pure black surfaces and no dead greys: secondary text and lines are tinted blue.

RTL rules: logical CSS properties only (`ms-`/`me-`, `ps-`/`pe-`, `start`/`end`); every part name, SKU, unit and price inside `<bdi>`; mirror arrows and sheets, not product photos; test every component at 360px.

## Page-by-page specs

Each page below lists what it must contain. Build them in the order of section 7.

### Header and navigation (all pages)

- One slim frosted-glass bar: logo, search field (opens the Spotlight-style search), account avatar. Nothing else competes with search.
- Categories live in a horizontal chip row under the header on catalog pages (Motion, Drivetrain, Electrical, Build, Suppliers), not in a mega menu: one tap, no hover.
- The cart is the floating pill, not a header icon, so it's always under the thumb.
- Mobile: same bar; search expands full-screen on tap; no hamburger menu.
- Footer: How it works, FAQ, shipping and lead times, terms, privacy, contact (email + WhatsApp), the Israeli supplier's details.

### Home

1. Hero: one large headline (every FRC/FTC supplier, one order, prices in ₪ with VAT) and the search field, centred, nothing else above the fold. Three example chips under it ("Kraken X60", "HTD 9mm", "1/2 hex bearing") that run the search on tap.
2. Signed-in teams see "Order again" (last order, one tap) and "Your cart" first, above everything else.
3. How it works: 4 steps in one row, short text, line icons.
4. Categories as large photo tiles (Apple Store-style), each opening the catalog pre-filtered.
5. Season picks: a horizontal scroller of kickoff essentials with "+" on every card.
6. Trust strip: lead time, last price update date, supplier logos.

### Catalog (listing)

- Category chips on top, then a single row of filter chips for the facets of that category (gears: DP, teeth, bore; belts: pitch, width, length; bearings: ID, OD, flanged). Tapping a chip opens a small popover of values; results update instantly, no "apply" button.
- Supplier, FRC/FTC, price and in-stock sit in a "More filters" sheet; active filters show as removable chips with "Clear".
- Card: large photo on a light tile, title (2 lines, LTR), "from ₪X", availability dot, and a "+" button. Families with variants show option chips inline on tap or hover, so a size is picked and added without opening the product page.
- Infinite scroll with the result count, position and filters kept in the URL; "back" returns to the same scroll spot.
- List view toggle for power users: a compact table (photo, SKU, title, price, stock, "+").

### Product page

- Layout like an Apple product page: big gallery on one side, a sticky buy panel on the other (on mobile, a sticky bottom bar with price and "Add").
- Buy panel: title, supplier, price, availability with check date, option chips (teeth, bore, width) that update SKU, price, photo and URL instantly, quantity stepper, one "Add to cart" button.
- Below the fold: Specifications (clean key-value table), Documentation (supplier docs, CAD/STEP, Onshape link), Description only when it is real text.
- "Usually ordered with" row with "+" on each card, so companion parts (bearings for a shaft, belts for pulleys) are one click each.
- SKU has a copy button; a small link to the supplier page sits at the bottom.

### Cart and quote request

- The cart is a sheet, never a separate checkout funnel: lines with photo, stepper and swipe-to-remove (with undo), grouped by supplier, an estimated ₪ total and one button, "Send quote request".
- Returning team: that button sends immediately and the sheet shows "Sent — quote within N business days". First-time: the same sheet asks only for team number and email (magic link or Google); the team name fills in automatically.
- Cost line, one tap to expand: items, VAT, handling fee, shipping "priced in the quote".
- "Share cart" copies a link, so a student builds the cart and a mentor sends it in one tap.

&#91;embedded content: order flow · 6 steps, team and supplier\]

Each box's status word is the value the order shows in the team's account at that step.

### Team account

- Order list with status: draft, quote requested, quote received, approved, ordered from suppliers, in transit, delivered.
- Order detail with a status timeline, quote PDF, and messages with the supplier.
- Saved carts and "reorder".
- Team members with roles: student (builds carts), mentor (approves and submits).

### Info pages

- How it works (with lead times and fees), FAQ, shipping and customs, returns and damaged parts, contact, about the Israeli supplier. All in Hebrew, linked from footer and cart.

### Supplier admin

- Incoming quote requests, per-supplier consolidation view (all open orders for WCP in one list to place one order), status updates that notify teams, price/availability sync status per supplier, and a flag for products whose scrape failed.

## Data model changes

Variant grouping and spec facets need two new layers on top of today's SKU rows. Everything else in the redesign is front-end work.

| Entity | New fields | Filled by |
| --- | --- | --- |
| ProductFamily | id, supplier, slug, title, category, program (FRC/FTC), images\[\], description (cleaned), docs\[\], cadUrl, tags | Grouping step during sync |
| Variant (today's SKU row) | familyId, options {teeth: 36, bore: "1/2 hex", width: "9mm"}, sku, priceIls, available, checkedAt | Sync + option parser |
| SpecValue | familyId or variantId, key (dp, bore, pitch, width, id, od…), value, unit | Parsed from titles + supplier spec tables |
| Order | teamId, status enum, lines\[\], quote file, timeline events | App |
| Team | number, name, school, members with role | Signup |

Grouping rules, in order:

1. Use the supplier's own product/variant structure where the Shopify feed has one (AndyMark and CTRE do: options inside one product).
2. For flat SKUs (most WCP gears), group by title with the size tokens stripped: "12t Steel Spur Gear (20 DP, 8mm SplineXS Bore)" → family "Steel Spur Gear (20 DP)", options teeth=12, bore=8mm SplineXS.
3. Regex parsers per category for teeth (`(\d+)t`), DP, bore, belt pitch/width/length, bearing ID/OD.
4. Log ungrouped items to an admin review list instead of guessing.

Keep variant URLs stable (`/catalog/wcp/wcp-0749` redirects to the family page with that variant selected) so existing links and carts keep working.

## Roadmap and Claude Code prompts

Six phases, each one Claude Code session and one Vercel preview. Phases 1 and 3 are low-risk and can ship first; phase 2 changes data, so it goes behind a preview check.

### Phase 0 — Setup

```
Read docs/REDESIGN.md fully. Then audit the repo: list the routes, data sources, sync scripts, DB schema and components, and map each item in the "Current-state audit" table to the files that need to change. Add a CLAUDE.md with the stack, commands, RTL rules and design tokens from the plan. Don't change features yet.
```

### Phase 1 — Design system, header, quick wins

```
Implement the "Click budget, interaction and visual design" section of docs/REDESIGN.md as the app's design system. Apple-like: system font stack (SF on Apple devices, Heebo fallback), the exact colour, type scale, radius, pill buttons and motion values from the table, light + dark themes as CSS variables, prefers-reduced-motion respected. Build: the slim frosted-glass header, the Spotlight-style search (/ or Ctrl/⌘K, instant results with photo, price and a "+" button, arrow keys + Enter to add, "x4" sets quantity), the floating cart pill with count and ₪ total that opens a cart sheet, and a <Ltr>/<bdi> wrapper for part names, SKUs and prices. Use logical CSS properties only. Also fix audit items 4, 5, 10, 11 (per-page titles/OG, server-rendered content with skeletons, alt text, Hebrew 404). Use view transitions between pages. Show screenshots at 360px and 1280px, light and dark, before finishing.
```

### Phase 2 — Variant families and spec facets

```
Plan first, then implement the "Data model changes" section of docs/REDESIGN.md. Add ProductFamily, Variant and SpecValue, a grouping step in the sync that uses supplier variant structure where it exists and title-token parsing for flat SKUs, and category-specific spec parsers (gears, belts, bearings, shafts first). Write unit tests for the parsers with 20 real titles per category. Output an admin list of ungrouped items. Keep old variant URLs working via redirect to the family page with the variant selected. Report how many SKUs grouped into how many families per supplier.
```

### Phase 3 — Catalog and product page

```
Rebuild the catalog and product page per "Page-by-page specs" in docs/REDESIGN.md, using the families from phase 2, and hold to the click budget: adding a known part must take 1 click and a part with options 2 clicks, without leaving the page. Catalog: category chips, a single row of facet chips with instant results (no apply button), "More filters" sheet, infinite scroll with state and scroll position kept in the URL, list-view toggle. Card: big photo tile, "from ₪X", availability dot, "+" that morphs into a − 1 + stepper and flies into the cart pill, inline option chips for families. Product page: Apple-style layout with gallery and sticky buy panel (sticky bottom bar on mobile), option chips that update SKU/price/photo/URL instantly, spec and docs sections, "usually ordered with" row with "+" buttons. Count the clicks for each task in the click budget table and report them.
```

### Phase 4 — Cart, quote request, accounts

```
Plan first, then build the cart and ordering flow from docs/REDESIGN.md. The cart is a sheet with one primary button, "Send quote request" — no checkout pages. Optimistic updates, swipe-to-remove with an Undo toast, no confirm dialogs. Returning teams send in 1 click (team, contact, delivery remembered). First-time teams fill only team number + email in the same sheet; sign-in by email magic link or Google; look up the team name from the number. Add share-cart links, "Order again" on home and the order list, roles (student builds, mentor sends/approves), the order status enum, and email/WhatsApp messages with a one-click signed "Approve quote" link that needs no login. Report the click count for every task in the click budget table.
```

### Phase 5 — Home, trust pages, admin

```
Build the home page (hero with search and example chips, how-it-works in 4 steps, image category tiles, season picks, supplier strip, trust strip) and the info pages (how it works, FAQ, shipping and lead times, returns, contact with WhatsApp, about the supplier) per docs/REDESIGN.md. Then build the supplier admin: incoming quote requests, per-supplier consolidation view, status updates that notify teams, sync status per supplier. Leave placeholders marked TODO for business facts I need to supply (fees, lead times, legal name).
```

## Acceptance checklist

Run these on the Vercel preview after each phase; a phase merges only when its boxes are ticked.

- [ ] Lighthouse mobile: performance ≥ 90, accessibility ≥ 95, SEO ≥ 95 on home, catalog and a product page
- [ ] First meaningful content without a "טוען…" text loader; layout shift < 0.1
- [ ] Every page usable at 360 px; no horizontal scroll; tap targets ≥ 44 px
- [ ] Part names, SKUs, prices and units never flip direction in RTL (check "1/2" Hex", "#10-32", "₪ 1,250")
- [ ] Searching a known SKU (e.g. WCP-0749) returns it first; a typo of a common name still finds it
- [ ] Gears category shows families, not 405 separate cards; each family's variant picker covers all its SKUs
- [ ] Old product URLs redirect to the right family and variant
- [ ] A guest can build a cart, share its link, and only meets signup at "send quote request"
- [ ] Filtered catalog URL opens the same view in a new tab
- [ ] Each product page has its own title, description and OG image
- [ ] Hebrew 404, and every footer link resolves
- [ ] Light only: no dark surfaces, even with the OS in dark mode; product photos sit on white or ice-blue tiles
- [ ] No middle dots (`·`) joining metadata, and no grey empty boxes

Click budget and feel checks:

- [ ] Known part, search to sent order: 3 clicks for a returning team (count on a phone)
- [ ] Part with options added from the catalog in 2 clicks, without a page load
- [ ] Order again and approve quote: 1 click each
- [ ] No confirm dialogs anywhere; every removal has Undo
- [ ] Cart and filters survive a refresh and a back-navigation
- [ ] Every tap gives feedback within 100 ms (stepper, pill count, toast)
- [ ] Motion is off with reduced-motion turned on

Business facts still needed from you before phase 5: handling fee, typical lead time per supplier, the Israeli supplier's legal name and contact, return policy.
