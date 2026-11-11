@AGENTS.md

# COTS-IL

A Hebrew (RTL) purchasing portal for FRC/FTC teams. Teams build carts from AndyMark, WCP, CTRE and The Thrifty Bot; the Israeli supplier (the admin) quotes, orders from each supplier by hand, receives and delivers. Live at https://cots-il.vercel.app (see "Production and access").

Read first:
- `docs/REDESIGN.md`: the redesign plan. Work goes one phase per session (its "Roadmap" section).
- `docs/REDESIGN-AUDIT.md`: routes, schema, the audit items mapped to files, the decisions (D1–D10) and the progress table.
- `docs/IMPROVEMENT-PLAN.md`: the current work plan (sessions S1–S12) from the Nov 10, 2026 audit.
- "Where things stand" below: what's done, what's next and what's open.
- `README.md` (setup, access model) and `PLAN.md` (the original build plan and data model).

## Stack

Next.js 16 App Router (`cacheComponents: true`, so dynamic data must sit inside `<Suspense>`) · React 19 · TypeScript · Supabase (Postgres, Auth, Storage) · Drizzle ORM · Tailwind 4 · Vitest · Vercel hosting · GitHub Actions for CI, the daily catalog sync and nightly backups. Node 24+.

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
```

## Production and access

- **Hosting:** Vercel team **COTS-IL** (slug `cots-il`, `team_xsvqZsEomvyPPYxmFtgSAbh0`), project `cotsil` (`prj_kPeUYubAOu4ISEmnB4m4R8kzULta`), on a Pro trial that ends about Nov 21, 2026 and then needs a card. It moved there on Nov 9, 2026 from the OrbitBOM team, whose unrelated `orbit-bom` project used up the free plan's CPU and got the whole team paused. Never deploy COTS-IL into OrbitBOM.
- **Deploying:** the Vercel account the CLI and MCP use (`harelkor`) is a Developer in the COTS-IL team. `vercel deploy --prod` is refused and environment variable values can't be read. Production deploys only by pushing to `main` (Git integration); pushing any other branch makes a preview. To redeploy without code changes, push an empty commit on top of `origin/main`.
- **Checking a deploy:** Vercel MCP `list_deployments`, `get_runtime_errors` and `get_runtime_logs` with the team and project IDs above. Usage and limits are on the dashboard's Usage page only.
- **Database:** Supabase project **COTS-IL**, ref `lzpxrlvtcxyoiuwkoaha` (eu-central-1), linked in the main checkout's `supabase/.temp`. The Supabase MCP connection only sees an unrelated project (`fteplaikueznmfqfqves`): never use it for COTS-IL. For production, use the Supabase CLI from the main checkout (`npx supabase inspect db … --linked`, `db push --remote`); reads and writes on production need the user's OK each time.
- **GitHub Actions:** `sync.yml` runs the catalog sync daily at 02:00 UTC and then calls `https://cots-il.vercel.app/api/revalidate` (secrets `DATABASE_URL`, `REVALIDATE_SECRET`). `ci.yml` runs lint, typecheck and tests; `backup.yml` backs up nightly.

## Where things stand (Nov 10, 2026)

Done, all on `main`: redesign phases 0–4 (families, catalog, cart sheet, quote requests, sign-in, approve links), a UI pass, and the COTS-IL visual refresh: the brand, the light-only Blue & White Fade palette, commas instead of `·`, the home page (category cards with real product photos from `getFacets`, example search chips, supplier pills) and "Install the app" (`src/app/manifest.ts`, `src/components/install-app.tsx`, icons in `public/`). See the Progress table in `docs/REDESIGN-AUDIT.md`.

Next: `docs/IMPROVEMENT-PLAN.md` (Nov 10, 2026 UX and platform audit). It replaces phase 5 of `docs/REDESIGN.md` with sessions S1–S12, each with findings, tasks, acceptance checks and a ready prompt; run one session at a time in its roadmap order and tick its Progress table. The business facts it needs are listed in its "What the user needs to provide"; leave them `null` in `src/lib/business.ts` until supplied.

Open:
- On Nov 9, right after the first deploy in the new team (empty cache), three `/catalog` requests hung for the full 300 s and one query hit the database's statement timeout. Nothing since, and the database is healthy (94 MB, ~50 ms for the category count). Not investigated: watch `get_runtime_errors` after the next deploy.
- "Install the app" is untested on a real Android phone and iPhone.
- An Oracle Cloud self-hosting setup (commit `c567564`, `deploy/` and `docs/DEPLOY-ORACLE.md`) exists only on branch `claude/cots-il-blue-white-redesign-e93c29`, not on `main`. Whether to use it is the user's call.

## Where code goes

| To change | Look in |
|---|---|
| Home page | `src/app/page.tsx`, `src/components/home-command-bar.tsx` |
| Catalog queries, facets, search | `src/lib/catalog.ts`, `src/lib/catalog-filters.ts`, `src/app/api/search/route.ts` |
| Catalog grid and filters | `src/app/catalog/page.tsx`, `src/components/catalog-browser.tsx`, `src/components/family-card.tsx` |
| Product (family) page | `src/app/catalog/p/[slug]/page.tsx`, `src/components/family-view.tsx` |
| Cart sheet and sending a request | `src/components/cart-pill.tsx`, `cart-panel.tsx`, `cart-store.ts`, `src/app/cart/actions.ts` |
| Header, search panel | `src/components/site-header.tsx`, `src/components/search-panel.tsx` |
| Orders, quotes, approvals | `src/app/orders`, `src/app/q/[token]`, `src/lib/orders.ts`, `src/domain/orders.ts` |
| Admin | `src/app/admin/*` (guarded by `requireAdmin`) |
| Supplier sync and grouping | `src/suppliers/*`, `src/domain/families/*` |
| Email notifications (Resend, off until `RESEND_API_KEY` and `EMAIL_FROM` are set) | `src/lib/notify.ts`, `src/lib/email-templates.ts`, `src/domain/notifications.ts` |
| Tokens and utilities (`card-surface`, `btn-brand`, `tile-fade`) | `src/app/globals.css` |

## Rules that don't change

- Writes go only through server actions that check permissions first (`requireAdmin`, `requireActiveViewer` in `src/lib/auth.ts`). RLS is read-only.
- `variants.id` is the key that carts, order items and POs point to. Never break it; order items keep their own snapshot.
- The catalog lists `product_families` (`/catalog/p/<slug>`), rebuilt from products and variants after every sync. Families hold nothing that isn't derived; grouping rules live in `src/domain/families`.
- Production migrations are applied by hand with `npx supabase db push --remote` (this CLI targets the local stack without `--remote`), and every push to `main` deploys production. Apply a migration before merging code that needs it.
- Removed on purpose, don't bring back: pasting a SKU list or dropping a BOM file into the cart (removed Nov 2026 to keep the cart and hero focused), and the dark theme (D10).
- The local Supabase stack runs on ports 544xx (`supabase/config.toml`). Another, unrelated project on this machine uses the default 543xx ports: never point COTS-IL commands at those.
- One kind of team account (D11, Nov 10, 2026): no student, mentor or viewer roles; everyone signed in to a team can build, send, approve, cancel and manage it. Membership in a team whose status allows ordering (`teamCanOrder`) is the only permission; the one guard is that a team can't remove its last sign-in email (`wouldLeaveNoMembers`). Copy says "הקבוצה" / "חשבון הקבוצה". The `memberships.role` / `team_invitations.role` columns and the `team_role` enum are legacy (always `team_admin`, never read) until they're dropped (S0 step 7b). Don't add role checks or role wording.
- Prices: `src/domain/pricing.ts` only. ILS = USD × Bank of Israel daily USD rate × 1.6, whole shekels, no VAT (user decision, Nov 11, 2026): never say a price "includes VAT" and show no VAT line. The price explanation is "the supplier's dollar price at the Bank of Israel rate of <date>, × 1.6; shipping is priced in the quote"; the rate comes from `exchange_rates` via `usdIlsRate()` in `src/lib/fx.ts`, fetched by the daily sync (last rate kept on failure, never 0). Availability is yes/no plus its check date, never a stock count.
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
| Palette (light only, "Blue & White Fade") | background #F6F9FF, surface #FFFFFF, subtle #ECF3FF / hover #DCE8FF, text #0B1528, secondary #52658A, hairline #D8E4FA, brand #1D4ED8 (strong #1E3A8A, soft #DBEAFE), tile #F2F7FF. No dark theme, no `dark:` variants: supplier photos are shot on white |
| Backdrop | `body` has an ice-blue radial fade at the top; `theme-color` #EBF3FF |
| Status | green #177A33, amber #995A00, red #D70015 (AA at 13px). Status is a small square `StatusTag`, never a pill that looks like a button |
| Cards | `.card-surface` (white-to-#F9FBFF fade, inner blue hairline, soft cobalt shadow), radius 18, hover lift 2px + `shadow-lift`; photos on `.tile-fade` |
| Buttons | `Button`/`buttonClass` in `src/components/form.tsx`: pill, 44px; primary = `.btn-brand` (one per screen), secondary = `.btn-soft`, ghost, danger. Cards: `Card` / `.card-surface`. Fields 44px `rounded-xl bg-subtle`. `npm run design-lint` (CI) fails on text under 13px, targets under 44px, `font-bold`, hex in TSX and ₪ outside `formatIls` |
| Header | sticky, translucent with backdrop blur, 52px, hairline bottom border |
| Motion | 200–300ms ease-out fades, spring for sheets and the stepper; none under `prefers-reduced-motion` |
| Icons | Lucide line icons, 20px, never the only label on a primary action |
| Spacing | 8px grid; page margins 24 mobile, 48+ desktop; max content width 1200 |

Anti-"AI slop": never join metadata with `·` (use `, ` or pill badges); never a grey empty box with a tiny corner icon (use blue-to-white fades, real thumbnails, cobalt hairlines).

Tokens live as CSS variables in `src/app/globals.css` (light and print) and are exposed to Tailwind through `@theme inline`.

## Click budget

Known part: 1 click to add, 3 from search to a sent order. A part with options: 2 clicks. Order again and approve quote: 1 click each. Never navigate away to add to the cart, no confirm dialogs (use an Undo toast), and never ask for something the app can work out. See "Click budget" in `docs/REDESIGN.md`.
