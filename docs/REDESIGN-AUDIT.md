# Redesign audit (Phase 0)

This is the Phase 0 audit for [REDESIGN.md](REDESIGN.md). It records what the app has today and which files each audit item touches. Checked against the code at `1c56263` and against https://cots-il.vercel.app on 2026-11-05.

## What exists today

### Routes (`src/app`)

| Route | What it is | Access |
|---|---|---|
| `/` | Hero, search form, text tiles for categories and suppliers | Public |
| `/catalog` | Search, dropdown filters, 24 per page, previous/next pagination | Public |
| `/catalog/[supplier]/[handle]` | One Shopify product: images, a SKU/price table with add-to-cart on each row, the supplier's description | Public, but adding needs an active team |
| `/login`, `/signup`, `/signup/check-email`, `/auth/confirm` | Email and password sign-in, email verification | Public |
| `/pending` | Team waiting for approval | Signed in |
| `/invite/[token]` | Accept a team invitation | Public link |
| `/cart` | Team cart page with the submit form (delivery method, contact, notes) | Signed in |
| `/orders`, `/orders/[id]` | Team's orders; quote approve/reject (`quote-decision.tsx`) | Signed in |
| `/deliveries/[id]` | Printable delivery note | Signed in |
| `/team` | Members, roles, invitations | Signed in |
| `/admin` | Dashboard: sign-ups, counts, sync status | Admin |
| `/admin/orders[/id]` | Order review and versioned quote editor | Admin |
| `/admin/purchasing[/id]` (+ `export`) | Merging lines by supplier, supplier POs, Shopify cart links, Excel | Admin |
| `/admin/logistics[/id]` | Shipments and import costs | Admin |
| `/admin/deliveries[/id]` | Deliveries | Admin |
| `/admin/shortages`, `/admin/reports` (+ `export`) | Shortages; sales, purchasing and profit reports | Admin |

`src/proxy.ts` sends signed-out visitors away from `/admin`, `/pending`, `/cart`, `/orders`, `/deliveries` and `/team`.

There is no `not-found.tsx`, `loading.tsx` or `error.tsx` anywhere.

### Data sources and sync

- **Database:** Supabase Postgres, read and written through Drizzle (`src/db/index.ts`, `src/db/schema.ts`). Row Level Security only allows reading. All writes go through server actions.
- **Catalog sync:** `scripts/sync.ts` calls `src/suppliers/sync.ts` (`syncSupplier`, `writeCatalog`). That reads `src/suppliers/shopify.ts` (`/products.json`, 250 per page, retries) for the 4 Shopify suppliers (AndyMark, WCP, CTRE, The Thrifty Bot). `.github/workflows/sync.yml` runs it every day.
- **Categories:** `src/suppliers/classify.ts` sorts products into 16 categories with regex rules on title, product type and tags. It also decides FRC/FTC and published/hidden.
- **Prices:** `src/domain/pricing.ts` (USD × 1.6, rounded to whole shekels).
- **Catalog queries:** `src/lib/catalog.ts` (`searchProducts`, `getFacets`, `getProduct`). Each one calls `connection()`, which makes every catalog page fully dynamic.
- **Images:** loaded straight from the supplier's CDN with a plain `<img>`, resized through Shopify's `?width=`.
- **Not built yet:** the CSV import for REV and goBILDA, the BigCommerce adapter, email sending (Resend), Playwright tests and Sentry.

### Database schema (`src/db/schema.ts`)

- **Enums:** `program` (FRC/FTC), `team_status`, `team_role` (`team_admin`, `buyer`, `viewer`), `product_status`, `order_status` (`submitted`, `quote_sent`, `approved`, `rejected`, `cancelled`), `quote_status`, `po_status`, `delivery_status` and others.
- **Identity:** `profiles`, `teams` (program, number, name, contact name/phone/email, address, status), `memberships`, `team_invitations`.
- **Catalog:** `suppliers`, `categories`, `products` (one Shopify product, with min/max price and `search_text` stored on it), `variants` (one SKU row, with `options` jsonb `[{name, value}]`), `price_history`, `sync_jobs`.
- **Ordering:** `cart_items` (one cart per **team**, keyed by `(team_id, variant_id)`), `team_orders`, `team_order_items` (copies the product details at submit time and points to `variant_id`), `quotes`, `quote_lines`, `quote_approvals` (`user_id` required).
- **Purchasing and logistics:** `supplier_pos`, `po_lines`, `po_allocations`, `shipments`, `shipment_items`, `import_costs`, `receipts`, `receipt_lines`, `stock_allocations`, `deliveries`, `delivery_items`, `audit_log`.
- There are 12 migrations in `supabase/migrations`, each with a matching `_rls` file.

### Components (`src/components`)

| File | Purpose |
|---|---|
| `site-header.tsx` | Header: logo, catalog link, a text cart link with count, orders, team, admin, sign-out. Rendered on the server inside `<Suspense>` in `layout.tsx` |
| `catalog.tsx` | `ProductCard`, `ProductImage`, `PriceRange` ("החל מ-"), `Availability` (with the check date), `productHref` |
| `add-to-cart.tsx` | Client form: a number field plus a button that calls the `addToCart` server action |
| `auto-submit.tsx` | A select and a checkbox that submit their form when changed (used by the catalog filters) |
| `orders.tsx`, `delivery-note.tsx`, `form.tsx`, `action-form.tsx`, `print-button.tsx` | Order tables, a printable delivery note, form helpers |

Styling: Tailwind 4 with color tokens in `src/app/globals.css` (light and print; the dark theme was removed on Nov 6, 2026, see D10). Heebo loads through `next/font`. A `.ltr` class keeps text left to right. There is no icon library and no UI kit.

## Audit items mapped to files

| # | Issue | Confirmed? | Files to change | Phase |
|---|---|---|---|---|
| 1 | Each size is its own card | Yes: gears show 17 pages (24 per page, about 405 cards). WCP lists every size as its own product (e.g. `/catalog/wcp/wcp-0749`). AndyMark and CTRE already put sizes inside one product as options | `src/db/schema.ts` + new migration, `src/suppliers/shopify.ts`, `src/suppliers/sync.ts`, new `src/suppliers/families.ts` (grouping and spec parsers), `src/lib/catalog.ts`, `src/components/catalog.tsx`, `src/app/catalog/[supplier]/[handle]/page.tsx` | 2, 3 |
| 2 | Guests can't add to cart | Yes: the "need a team account" box is at `[handle]/page.tsx:116`, and adding is gated by `canAdd` at :99 | `src/components/add-to-cart.tsx`, `src/app/cart/actions.ts`, `src/app/cart/page.tsx` and `checkout-form.tsx`, `src/lib/orders.ts`, `src/proxy.ts` (`/cart` is private), `src/components/site-header.tsx`. The cart lives in the database per team (`cart_items`), so a guest cart needs browser storage plus a merge into the team cart at sign-in | 1 (pill), 4 |
| 3 | Junk descriptions | Yes: "Reference Only" appears on `/catalog/wcp/wcp-0749` | `src/suppliers/shopify.ts` (`sanitizeDescription`: drop placeholder text at sync time), `[handle]/page.tsx:146-152` | 3 |
| 4 | Product pages use the site name as their title | Yes: the `<title>` was the old site name (now COTS-IL, see D10) and there are no `og:` tags. The catalog page has a fixed title | `[handle]/page.tsx` (add `generateMetadata`), `src/app/layout.tsx` (`metadataBase`, title template, default OG image), `src/app/catalog/page.tsx` | 1 |
| 5 | Content loads behind "טוען…" | Yes: the live home and catalog pages both show it. The text fallback is in 21 pages | `src/app/page.tsx:90`, `src/app/catalog/page.tsx:126`, `[handle]/page.tsx:159`, plus the admin, orders, cart, team and pending pages. With `cacheComponents: true` (`next.config.ts`), dynamic data has to sit inside `<Suspense>`, so the fix is skeleton fallbacks plus caching the public catalog queries in `src/lib/catalog.ts` (instead of `connection()`) | 1 |
| 6 | Header has no cart icon or search | Yes | `src/components/site-header.tsx`, `src/app/layout.tsx`, new search and cart-pill client components | 1 |
| 7 | Fees, lead times and the Israeli supplier are never explained | Yes: there's only one line about VAT and shipping | New info routes, a footer in `layout.tsx`, `src/app/page.tsx` | 5 |
| 8 | Filters are dropdowns, with no spec filters | Yes | `src/app/catalog/page.tsx` (`FilterBar`), `src/components/auto-submit.tsx`, `src/lib/catalog-filters.ts`, `src/lib/catalog.ts`. Spec filters need the `SpecValue` data from Phase 2 | 3 |
| 9 | Pagination is only previous/next | Yes | `src/app/catalog/page.tsx` (`Pagination`), `src/lib/catalog-filters.ts` (`page`, `PAGE_SIZE`) | 3 |
| 10 | Card images have empty alt text | Yes | `src/components/catalog.tsx:67`, `[handle]/page.tsx:52`, `src/app/cart/page.tsx:25` | 1 |
| 11 | The 404 page is Next.js's English default | Yes: "This page could not be found" | New `src/app/not-found.tsx` (plus `[handle]/page.tsx`, which already calls `notFound()`) | 1 |

## Where the plan conflicts with the app

None of these block Phase 1. Each one has to be decided before the phase listed.

| # | Plan says | App has today | Suggestion | Decide before |
|---|---|---|---|---|
| D1 | Sign in with an email link or Google, no password | Email and password with email verification (`src/app/auth`, `login`, `signup`) | Add an email link and Google through Supabase Auth, and keep passwords for the existing accounts | Phase 4 |
| D2 | Roles: student builds the cart, mentor sends and approves | `team_admin` (approves quotes, manages members), `buyer` (adds to cart, submits), `viewer` | Keep the database values and relabel them: `team_admin` = mentor, `buyer` = student. Decide whether a student can still submit (today a buyer can) | Phase 4 |
| D3 | Order statuses: draft, quote requested, quote received, approved, ordered from suppliers, in transit, delivered | Stored: `submitted`, `quote_sent`, `approved`, `rejected`, `cancelled`. The later stages are worked out from the purchasing and delivery records, not stored | Keep the stored statuses and work the plan's labels out from them plus the records, so the purchasing records stay the single source of truth | Phase 4 |
| D4 | Approve the quote with one click from email or WhatsApp, no login | `quote_approvals.user_id` is required, and approval is limited to `team_admin` | A signed link sent to one named mentor, valid only for that quote version and its content hash, and recorded against that mentor | Phase 4 |
| D5 | Product families with variants under them | `products` is already a family for AndyMark and CTRE (options inside one product). WCP is flat. Order items, POs and carts all point to `variants.id` | Keep `variants.id` as the stable key everything points to. Add `product_families` above `products` (or a `family_id` on products) and a `spec_values` table. Old `/catalog/[supplier]/[handle]` links redirect to the family page | Phase 2 |
| D6 | 1-click send for a returning team | Submitting needs delivery method, contact name and phone (`team_orders`) | Prefill these from the team's last order or `teams.contact_*`, and send without showing the form | Phase 4 |
| D7 | 4 suppliers, 4,163 products | The code and PLAN.md also plan for REV and goBILDA (CSV import, not built) | Leave them out of the redesign until the CSV import exists | Phase 2 |
| D8 | Phone haptic tap on add | `navigator.vibrate` does nothing on iOS Safari | Use it where it's supported. On iOS the visual feedback is enough | Phase 3 |
| D9 | Order flow diagram | The diagram was embedded in the plan and isn't in the Markdown copy | Add it as an image if it matters | Phase 4 |
| D10 | Visual direction | Apple-like greys, accent #0071E3, a dark theme on `prefers-color-scheme`, and the site called "פורטל רכש FIRST" | The COTS-IL brand on the light-only Blue & White Fade palette (Team 1690 cobalt and white). Supplier photos are shot on white, so the dark theme is gone. Guardrails: no `·` between metadata (commas or pill badges instead), no grey empty boxes (blue-to-white fades, real thumbnails, cobalt hairlines). Tokens and rules in `docs/REDESIGN.md` → "Visual language" | Visual refresh (Nov 6, 2026) |

## Business facts still needed (Phase 5)

Handling fee, typical lead time for each supplier, the Israeli supplier's legal name and contact details (email, WhatsApp), the return policy, the pickup address, and which domain emails are sent from.

## Progress

| Phase | Commit | Audit items closed |
|---|---|---|
| 1 | `385073f` | 4 (titles and OG), 5 (skeletons, cached catalog), 10 (alt text), 11 (Hebrew 404); 3 (placeholder descriptions) early |
| 2 | `237459e` | 1 (product families) |
| 3 | `eb4c727` | 8 (spec filter chips), 9 (infinite scroll with the page in the URL) |
| 4 | this phase | 2 (guest cart). Decisions: D1 email link + Google (passwords kept); D2 mentors send and approve, students build carts; D3 stages derived, nothing stored; D4 signed approve link per mentor; D6 delivery and contact remembered |
