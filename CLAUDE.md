@AGENTS.md

# COTS-IL

A Hebrew (RTL) purchasing portal for FRC/FTC teams. Teams build carts from AndyMark, WCP, CTRE and The Thrifty Bot; the Israeli supplier (the admin) quotes, orders from each supplier by hand, receives and delivers. Live at https://cots-il.vercel.app (see "Production and access").

Read first:
- `docs/REDESIGN.md`: the redesign plan. Work goes one phase per session (its "Roadmap" section).
- `docs/REDESIGN-AUDIT.md`: routes, schema, the audit items mapped to files, the decisions (D1–D10) and the progress table.
- `docs/IMPROVEMENT-PLAN.md`: the Nov 10, 2026 audit and its sessions S0–S15. Its "Status (Nov 11, 2026)" paragraph and Progress table say what is done; only S12 is left.
- `docs/admin-guide.md`: the supplier's guide, with the "Setup still needed" checklist of user-side steps. `docs/S9-OPS.md`: dashboard steps (Sentry, Firewall).
- "Where things stand" below: what's done, what's next and what's open.
- `README.md` (setup, access model) and `PLAN.md` (the original build plan and data model).

## Stack

Next.js 16 App Router (`cacheComponents: true`, so dynamic data must sit inside `<Suspense>`) · React 19 · TypeScript · Supabase (Postgres, Auth, Storage) · Drizzle ORM on node-postgres (`pg` with `attachDatabasePool` and a query timeout, `src/db/index.ts`) · Tailwind 4 · Vitest · Playwright · Vercel hosting · GitHub Actions for CI, the daily catalog sync and nightly backups. Node 24+.

## Commands

```bash
npm install
npm run supabase:start   # local Supabase in Docker
npm run env:local        # writes .env.local from the local stack
npm run seed             # demo admin, teams and suppliers
npm run dev              # http://localhost:3000
npm run lint && npm run typecheck && npm test   # what CI runs
npm run e2e              # Playwright smoke test on the local stack (own dev server on :3100)
npm run db:generate      # migration from src/db/schema.ts
npm run db:reset         # rebuild local DB from migrations, then seed again
npm run sync             # sync Shopify suppliers (npm run sync -- wcp for one), then regroup families
npm run regroup          # rebuild product families from the DB, no fetching
npm run icons            # redraw the app icons in public/ (manifest and Apple touch icon)
npm run vendor-logos     # white-ink copies of public/vendors logos for the dark home page (public/vendors/on-dark)
```

## Production and access

- **Hosting:** Vercel team **COTS-IL** (slug `cots-il`, `team_xsvqZsEomvyPPYxmFtgSAbh0`), project `cotsil` (`prj_kPeUYubAOu4ISEmnB4m4R8kzULta`), on a Pro trial that ends about Nov 21, 2026 and then needs a card. It moved there on Nov 9, 2026 from the OrbitBOM team, whose unrelated `orbit-bom` project used up the free plan's CPU and got the whole team paused. Never deploy COTS-IL into OrbitBOM.
- **Deploying:** the Vercel account the CLI and MCP use (`harelkor`) is a Developer in the COTS-IL team. `vercel deploy --prod` is refused and environment variable values can't be read. Production deploys only by pushing to `main` (Git integration); pushing any other branch makes a preview. To redeploy without code changes, push an empty commit on top of `origin/main`.
- **Checking a deploy:** Vercel MCP `list_deployments`, `get_runtime_errors` and `get_runtime_logs` with the team and project IDs above. Usage and limits are on the dashboard's Usage page only.
- **Database:** Supabase project **COTS-IL**, ref `lzpxrlvtcxyoiuwkoaha` (eu-central-1), linked in the main checkout's `supabase/.temp`. The Supabase MCP connection only sees an unrelated project (`fteplaikueznmfqfqves`): never use it for COTS-IL. For production, use the Supabase CLI from the main checkout (`npx supabase inspect db … --linked`, `db push --remote`); reads and writes on production need the user's OK each time.
- **GitHub Actions:** `sync.yml` runs the catalog sync daily at 02:00 UTC and then calls `https://cots-il.vercel.app/api/revalidate` (secrets `DATABASE_URL`, `REVALIDATE_SECRET`). `ci.yml` runs lint, typecheck and tests; `backup.yml` backs up nightly.

## Where things stand (Nov 13, 2026)

Done, all on `main`: redesign phases 0–4, the UI pass and the COTS-IL visual refresh, then the whole improvement plan except S12: S0–S11, S13–S15 and S10A (one team account, cart sheet fixes, email-code sign-in, Resend notifications, trust pages, search, catalog and product-page work, quote tracking, design system, DB hang fixes, catalog overrides). Also on `main`: prices of USD × Bank of Israel rate × 1.6 with no VAT; the catalog's 16 category chips under 5 expandable groups; admin order cards that open in the browser with outlined sections and a shipments section; Vercel functions in `fra1` (`vercel.json`); BotID and analytics funnel events; Playwright (`npm run e2e`) and Lighthouse CI; `npm run admin` to grant or revoke the admin. The Nov 9 `/catalog` hangs are fixed (node-postgres, no DB call in `not-found.tsx`, `fra1`). S16 (admin settings) is done: S16a–d, so the operator runs the business details, pricing, admins, suppliers, products, categories (names, order, groups, home photo, hiding), site content (search examples, banner, info-page text) and a system status page from `/admin/settings`; vendor-first S17 too.

Still in code, for a later session if the operator asks: the vendor boxes' Hebrew blurbs and order (`VENDORS` in `src/domain/vendors.ts`), the home hero, value strip and `/how-it-works` text, the catalog meta description and OG image supplier names, the privacy and terms pages, the email templates' text, Hebrew search synonyms (`src/domain/search-synonyms.ts`), which categories the empty search panel offers (`SEARCH_CATEGORIES`, names come from the DB) and the accessory/main-item ranking rules (`src/domain/catalog-rank.ts`).

Next: S12 (lists, season kits, budgets, in `docs/IMPROVEMENT-PLAN.md`) is not started and is the user's pick. Bugs the user reports come first.

Waiting on the user (steps in `docs/admin-guide.md`, "Setup still needed"):
- Supabase production SMTP and Hebrew sign-in templates; `RESEND_API_KEY` and `EMAIL_FROM` in Vercel (emails stay off until then).
- The business facts, now in `/admin/settings/business` (all empty, their sentences hidden).
- Vercel dashboard: Firewall rules, Skew Protection, Deployment Protection, BotID, Spend Management (the Pro trial ends about Nov 21, 2026 and needs a card). Optional Sentry DSN (`docs/S9-OPS.md`).
- A decision on Vercel Image Optimization; recommended skip, about 6,900 source images.

Open:
- Not yet tried by a person: the team flow on a real phone, the catalog override forms, the admin order cards on production, "Install the app" on Android and iPhone.
- Backorder items still show as available at AndyMark and The Thrifty Bot: Shopify data can't tell backorder from in stock (WCP and CTRE are read from their pages, goBILDA and REV from BigCommerce pages).
- goBILDA and REV are read from their pages without a written OK from either vendor (PLAN.md planned to ask first). robots.txt allows it; a vendor feed would replace `src/suppliers/bigcommerce.ts`.
- An Oracle Cloud self-hosting setup (commit `c567564`, `deploy/`, `docs/DEPLOY-ORACLE.md`) exists only on branch `claude/cots-il-blue-white-redesign-e93c29`, not on `main`. The user's call.

## Where code goes

| To change | Look in |
|---|---|
| Home page (vendor boxes first, then categories across all vendors) | `src/app/page.tsx`, `src/components/vendor-boxes.tsx`, `src/components/category-showcase.tsx`, `src/components/home-command-bar.tsx` |
| Home competition scene (ultramarine midnight canvas; laid out as Hebrew reads: headline on the right, the two 1690 photos as shot (not mirrored), Crescendo on the left of the hero, Reefscape in the right lane beside the 2×2 vendor grid on the left; splash masks and paint splashes; hero motto and live telemetry bar; vendor-coloured glass boxes with white-ink logos and pearl photo tiles; Nov 14, 2026) | `src/components/home-scene.tsx`, `src/components/scroll-parallax.tsx`, `vendorGlass`/`darkLogo` in `src/domain/vendors.ts`, "The home page as one competition photograph" at the end of `src/app/globals.css`; photos `public/orbit-1690-{tall,short}.jpg`, smaller copies from `npm run robot-photos` (the Crescendo copies from `public/orbit-1690-short-hd.jpg`, a Real-ESRGAN 4x enlargement brought to 3,000 px; its `mirror: true` flips a photo with its lettering kept readable), first row AndyMark, WCP, goBILDA (`homeVendorOrder`), the scene 32px from the window edges from 1024px; no page scrollbar anywhere (globals.css, `html`), logos from `npm run vendor-logos` |
| Vendor stores `/v/<code>` (most wanted, groups, search; vendor prices on cards; dark night canvas themed in the vendor's own palette since Nov 14, 2026: `vendorPalette`/`vendorTheme` set `--vendor-*` on `.vendor-theme`, which re-points the site tokens; flagship header, search console with a live dropdown of the vendor's top 3 matches (`/api/search?vendor=`), 4 most-wanted parts, `SectionHeading`) | `src/app/v/[vendor]/page.tsx`, `src/components/store-search.tsx`, `src/components/section-heading.tsx`, "Vendor stores" at the end of `src/app/globals.css`, `getVendors`/`getVendorStore`/`getVendorPopular` and `toCards(rows, supplierCode)` in `src/lib/catalog.ts`, `src/domain/vendors.ts` |
| Catalog queries, facets, search (the search order's steps: `rankSearch` in `src/domain/search-rank.ts`, mirrored in SQL by `searchQuery`; category chip counts follow the search: `getCategoryCounts`; option names in Hebrew: `OPTION_LABELS`/`optionLabel` in `src/domain/families/sort.ts`) | `src/lib/catalog.ts`, `src/lib/catalog-filters.ts`, `src/app/api/search/route.ts` |
| Catalog grid and filters | `src/app/catalog/page.tsx`, `src/components/catalog-browser.tsx`, `src/components/family-card.tsx` |
| Product (family) page (`?v=` a variant id or SKU, `?vendor=` settles a SKU two vendors share: `findLinked`/`variantParam` in `src/domain/families/link.ts`) | `src/app/catalog/p/[slug]/page.tsx`, `src/components/family-view.tsx` |
| Cart sheet and sending a request | `src/components/cart-pill.tsx`, `cart-panel.tsx`, `cart-store.ts`, `src/app/cart/actions.ts` |
| Header, search panel (T18: "קטגוריות" and "ספקים" menus from 1024px, inside the account/guest menu below that; `HeaderMenu` is a popover disclosure) | `src/components/site-header.tsx`, `src/components/header-menu.tsx`, `src/components/header-nav.tsx`, `src/lib/header-nav.ts`, `src/components/search-panel.tsx` |
| Orders, quotes, approvals | `src/app/orders`, `src/app/q/[token]`, `src/lib/orders.ts`, `src/domain/orders.ts` |
| Admin: `/admin` (כל ההזמנות), `/admin/purchasing` (הזמנות ספקים), order cards | `src/app/admin/*` (guarded by `requireAdmin`), `src/lib/admin-orders.ts`, `src/domain/admin-orders.ts`, `src/lib/purchasing.ts` |
| Catalog overrides (`/admin/catalog`: hide, photos, category, merge, pin) | `src/app/admin/catalog`, `src/domain/catalog-overrides.ts` |
| One order status for every screen (T4 status dictionary: `STATUS` with admin and team words and a tone; `statusLabel`/`lineLabel`/`deliveryLabel`, derived `shipmentStatus`, the team's `compactTimeline`; every label, tag colour, email subject and `/how-it-works` reads from it) | `src/domain/order-status.ts`, `src/lib/order-status.ts`, `src/components/order-status-tag.tsx` (`OrderStatusTag`, `TONE_TAG`/`TONE_BOX`: neutral, us, team, done, problem); Hebrew counts in `src/domain/plural.ts` (`countOf`, `units`) |
| Exchange rate and prices | `src/lib/fx.ts`, `src/domain/pricing.ts`, `src/suppliers/boi.ts` |
| Admin settings (`/admin/settings`: פרטי העסק, תמחור, מנהלים, ספקים, מוצרים, קטגוריות, תוכן האתר, מערכת) | `src/app/admin/settings/*`, `src/domain/settings.ts` (zod schema), `src/lib/settings.ts` (`getSettings`/`getBusiness`/`priceContext`, cached under the `settings` tag), `src/lib/settings-write.ts` (`writeSettings` with audit_log) |
| Categories (`/admin/settings/categories`: names, order, groups, home photo, hide; S16d) | `categories.group_id`/`hidden`/`home_image`, groups in `content.categoryGroups`, `src/domain/category-groups.ts`; client components read groups from `useSiteFacts()` |
| Site content (`/admin/settings/content`: search examples, banner, pins list, info-page text) | `content` in `src/domain/settings.ts`, `src/domain/info-text.ts` (format, tokens, today's text as `DEFAULT_PAGES`), `src/components/info-text*.tsx` (the five info pages render through `InfoTextPage`), `src/components/announcement-banner.tsx` |
| System status (`/admin/settings/system`: sync history, rate, email test, GitHub token, last deploy, dashboard links) | `src/app/admin/settings/system` |
| Health list (M1: per-supplier sync, rate, backup, revalidate, digest, emails, GitHub key expiry, admins; ok/yellow/red) shown in the banner on every `/admin` page (merged with the go-live checklist) and the "בריאות האתר" card; the daily Vercel Cron watchdog (`CRON_SECRET`, emails admins on red); `/api/health`; stale vendors (4 days) price "ייבדק בהצעה" on the product page | `src/domain/health.ts`, `src/lib/health.ts`, `src/app/admin/admin-banner.tsx`, `src/app/admin/health-list.tsx`, `src/app/api/cron/watchdog`, `src/app/api/health`, `job_runs` (written by the routes, `backup.yml` and `npm run job-report`) |
| Business facts (fees, phone, lead times; `null` until supplied) | `getBusiness()` on the server, `useSiteFacts()` in client components (`src/components/site-facts.tsx`) |
| Supplier sync and grouping (two vendors merge on a shared SKU, a part number one names in its description, or the same name plus price or maker, never a title alone; the rest go to the report as `name-only`; one vendor's "Title - Opt:Val, …" listings fold into one family; tests per case in `merge.test.ts`) | `src/suppliers/*`, `src/domain/families/*` |
| goBILDA and REV (BigCommerce page reading: sitemap → product pages → option lookups, 1 request/s; full pass Saturdays UTC, daily refresh of carts/orders/pins) | `src/suppliers/bigcommerce.ts`, `src/suppliers/http.ts` (polite client, robots.txt), `src/domain/bigcommerce.ts` (parsing, fixtures in `src/domain/__fixtures__/bigcommerce`), `src/domain/sync-health.ts` (the layout guard), `refreshTargets` in `src/suppliers/sync.ts` |
| Suppliers admin (`/admin/settings/suppliers`: add by URL, edit, hide, delete, sync now via GitHub `GITHUB_TOKEN`) | `src/app/admin/settings/suppliers`, `src/lib/supplier-admin.ts`, `src/domain/supplier-detect.ts` |
| Products admin (`/admin/settings/products`: per-supplier cards, edit sheet, custom parts, delete or hide; S16c) | `src/app/admin/settings/products`, `src/lib/product-admin.ts`, `src/domain/part-editor.ts`, `applyOverrides` in `src/suppliers/families.ts` |
| Email notifications (Resend, off until `RESEND_API_KEY` and `EMAIL_FROM` are set) | `src/lib/notify.ts`, `src/lib/email-templates.ts`, `src/lib/email-transport.ts`, `src/domain/notifications.ts` |
| Tokens and utilities (`card-surface`, `btn-brand`, `tile-fade`) | `src/app/globals.css` |

## Rules that don't change

- Writes go only through server actions that check permissions first (`requireAdmin`, `requireActiveViewer` in `src/lib/auth.ts`). RLS is read-only.
- `variants.id` is the key that carts, order items and POs point to. Never break it; order items keep their own snapshot.
- The catalog lists `product_families` (`/catalog/p/<slug>`), rebuilt from products and variants after every sync. Families hold nothing that isn't derived; grouping rules live in `src/domain/families`.
- Production migrations are applied by hand with `npx supabase db push --remote` (this CLI targets the local stack without `--remote`), and every push to `main` deploys production. Apply a migration before merging code that needs it.
- Removed on purpose, don't bring back: pasting a SKU list or dropping a BOM file into the cart (removed Nov 2026 to keep the cart and hero focused). The old light theme is gone too: since Nov 14, 2026 the whole site is one dark system (user decision, replacing D10); there's no light/dark switch.
- The local Supabase stack runs on ports 544xx (`supabase/config.toml`). Another, unrelated project on this machine uses the default 543xx ports: never point COTS-IL commands at those.
- One kind of team account (D11, Nov 10, 2026): no student, mentor or viewer roles; everyone signed in to a team can build, send, approve, cancel and manage it. Membership in a team whose status allows ordering (`teamCanOrder`) is the only permission; the one guard is that a team can't remove its last sign-in email (`wouldLeaveNoMembers`). Copy says "הקבוצה" / "חשבון הקבוצה". The `memberships.role` / `team_invitations.role` columns and the `team_role` enum are legacy (always `team_admin`, never read) until they're dropped (S0 step 7b). Don't add role checks or role wording.
- Prices: `src/domain/pricing.ts` only. ILS = USD × rate × multiplier, rounded (whole shekels by default), no VAT (user decision, Nov 11, 2026): never say a price "includes VAT" and show no VAT line. Since S16a the admin sets these in `/admin/settings/pricing`: the global multiplier (1.6), per-supplier and per-category multipliers (`pricing_rules`; precedence part fixed ₪ (S16c) > category > supplier > global, `resolveMarkup`), a manual rate override, rounding and a minimum. A variant's fixed ₪ price (`variants.fixed_ils`, from `variant_overrides.fixed_ils`, S16c) beats all of them: pass it as `priceIls`'s fourth argument. Each regroup writes the resolved multiplier to `variants.markup` and the families' `min_list_usd`/`max_list_usd` (USD × multiplier); readers call `priceIls(usd, await priceContext(), v.markup, v.fixedIls)` (or `priceIls(family.minListUsd, ctx, 1)`), with `priceContext()` from `src/lib/settings.ts`. A pricing save regroups and expires the `catalog` and `settings` tags; order items keep their own `multiplier`, rate and price. The price explanation is "the supplier's dollar price at the Bank of Israel rate of <date>, × <multiplier>; shipping is priced in the quote" (`markupText`); the Bank of Israel rate comes from `exchange_rates` via `getUsdIlsRate()` in `src/lib/fx.ts`, fetched by the daily sync (last rate kept on failure, never 0). Availability is yes/no plus its check date, never a stock count.
- Pure logic goes in `src/domain` with Vitest tests.

## RTL

- `<html lang="he" dir="rtl">`. Logical properties only: `ms-`/`me-`, `ps-`/`pe-`, `start`/`end`, `inset-inline-*`. Never `ml-`/`mr-`/`left`/`right` for layout.
- Every part name, SKU, unit and number with units goes in `<Ltr>` (`src/components/ltr.tsx`, a `<bdi dir="ltr">`); older pages still use the `.ltr` class. Check "1/2" Hex", "#10-32".
- Prices come from `formatIls`, whose he-IL output already carries its own direction marks: don't wrap it in `<Ltr>`, which squashes "₪ 1,250" into "1,250₪".
- Mirror arrows and sheets, never product photos.
- Every component must work at 360px with no horizontal scroll and tap targets of at least 44px.

## Design tokens (from docs/REDESIGN.md)

| Token | Value |
|---|---|
| Font | `-apple-system, "SF Pro Text", "SF Hebrew", "Segoe UI", Heebo, sans-serif`; mono `ui-monospace, "SF Mono", "JetBrains Mono"` |
| Type scale | 48/40 hero, 28 page title (`text-title`), 20 section, 17 body, 15 callout (`text-callout`), 13 caption (the minimum); headlines 600, tracking −0.02em |
| Brand | **COTS-IL** everywhere (never "פורטל רכש FIRST"); header mark = `.btn-brand` badge + gradient "COTS-IL" in `<Ltr>` + "FRC / FTC" pill |
| Palette (one dark system, Nov 14, 2026, user decision) | Orbit 1690 ultramarine over a deep midnight, tokens on `:root` in `globals.css`: background #020416, surface #0B1336, subtle/hover ultramarine at 8%/15%, text #F1F4FF, secondary #A3AED6, hairline ultramarine 18%, brand text tint #8094FF (strong #B4C0FF), fills `--brand-fill` #0018E0 / strong #0014BE (`.bg-brand` and the status fills `.bg-success`/`.bg-danger`/`.bg-warning` use the deep fill tones so white text reads), status text green #4ADE80, amber #FBBF24, red #F87171, violet/teal/indigo light tints. Product photos only ever sit on pearl wells (`tile-fade`, `bg-tile`, `.card-photo`, with `mix-blend-multiply` on the image), never on dark glass and never inside a whole white card. A vendor's own palette (`vendorTheme`) colours its store and a product sold by that vendor alone; the home page and the stores add their scenes on top. Print stays black on white |
| Backdrop | `body` is midnight with a soft ultramarine glow at the top; `color-scheme: dark`; `theme-color` and the manifest colours #020416 |
| Status | green #177A33, amber #995A00, red #D70015 (AA at 13px). Status is a small square `StatusTag`, never a pill that looks like a button |
| Cards | `.card-surface` (dark navy glass, an ultramarine hairline drawn inside, a faint top highlight, soft shadow), radius 18, hover lift 2px + `shadow-lift`; product cards (`.family-card`) take the page's vendor colour on their border and glow; photos on `.tile-fade` |
| Buttons | `Button`/`buttonClass` in `src/components/form.tsx`: pill, 44px; primary = `.btn-brand` (one per screen), secondary = `.btn-soft`, ghost, danger. Cards: `Card` / `.card-surface`. Fields 44px `rounded-xl bg-subtle`. `npm run design-lint` (CI) fails on text under 13px, targets under 44px, `font-bold`, hex in TSX and ₪ outside `formatIls` |
| Header | sticky, translucent with backdrop blur, 52px, hairline bottom border |
| Motion | 200–300ms ease-out fades, spring for sheets and the stepper; none under `prefers-reduced-motion` |
| Icons | Lucide line icons, 20px, never the only label on a primary action |
| Spacing | 8px grid; page margins 24 mobile, 48+ desktop; max content width 1200 |

Anti-"AI slop": never join metadata with `·` (use `, ` or pill badges); never a grey empty box with a tiny corner icon (use blue-to-white fades, real thumbnails, cobalt hairlines).

Tokens live as CSS variables in `src/app/globals.css` (light and print) and are exposed to Tailwind through `@theme inline`.

## Vendor-first (S17, Nov 13, 2026)

Teams pick a vendor first (home boxes → `/v/<code>`); all-vendor browsing by category stays lower on the home page and at `/catalog`. A store's "most wanted" list (`rankPopular` in `src/domain/popular.ts`) puts the admin's pins on that vendor's products (S15 "מומלץ") first, then demand: the vendor's own best-seller rank (`products.best_seller_rank`, read by the daily sync from the store's `/collections/all?sort_by=best-selling` page, `src/suppliers/best-sellers.ts`) blended with our orders (distinct teams and quantity, last 12 months), with orders taking over as more teams order. "גלו עוד" (`pickDiscovery`, `discovery-strip.tsx`) shows in-stock, mid-priced parts outside that list, shuffled by day. Inside a store, cards and the product page (`?vendor=`) show only that vendor's offer. A cart still sends **one** request; the cart, request, quote and admin card are divided into vendor sections with subtotals (`supplierSections` in `src/domain/cart.ts`).

## Click budget

Known part: 1 click to add, 3 from search to a sent order. A part with options: 2 clicks. Order again and approve quote: 1 click each. Never navigate away to add to the cart, no confirm dialogs (use an Undo toast), and never ask for something the app can work out. See "Click budget" in `docs/REDESIGN.md`.
