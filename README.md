# BLUEHUB: FRC / FTC purchasing portal

Teams build carts from AndyMark, WCP, CTRE and The Thrifty Bot (REV and goBILDA wait for a CSV import, see D7), and the Israeli supplier quotes, orders from each supplier, receives and delivers. See [PLAN.md](PLAN.md) for the full plan.

Stack: Next.js 16 (App Router) · Supabase (Postgres, Auth, Storage) · Drizzle ORM · Tailwind (Hebrew RTL) · Vitest · Playwright.

The site is called **BLUEHUB** (COTS-IL until Nov 16, 2026; the domain, the Vercel and Supabase projects and the repo keep the old name). Live at https://cots-il.vercel.app, hosted on the Vercel team COTS-IL with the database on the Supabase project COTS-IL. Every push to `main` deploys production. Details, and what to work on next, are in [CLAUDE.md](CLAUDE.md).

## Local setup

Requirements: Node 24+, Docker Desktop (running).

```bash
npm install
npm run supabase:start   # local Postgres + Auth + Mailpit in Docker (first run downloads images)
npm run env:local        # writes .env.local from the running stack
npm run seed             # admin, two demo teams, six suppliers
npm run dev              # http://localhost:3000
```

Local services (on 544xx ports, so they never clash with another local Supabase project on the defaults):
- Supabase Studio (browse the DB): http://127.0.0.1:54423
- Mailpit (catches sign-up / verification emails): http://127.0.0.1:54424

Seeded logins (`*@beniadam.test`) all use `SEED_PASSWORD` from `.env.local`:
- `mentor@beniadam.test`: admin (the Israeli supplier)
- `frc1690@beniadam.test` and `frc1690-2@beniadam.test`: two sign-in emails on the approved FRC team's account
- `ftc20001@beniadam.test`: FTC team waiting for approval

## Database changes

1. Edit `src/db/schema.ts`
2. `npm run db:generate` writes a migration to `supabase/migrations/`
3. `npm run db:reset` rebuilds the local DB from all migrations, then run `npm run seed`

Hand-written SQL (RLS policies, triggers): `npx drizzle-kit generate --custom --name=<name>`.

## Access model

- Row Level Security: signed-in users can read only their own team's rows; admins read everything; anonymous users read nothing. There are no write policies.
- All writes go through server actions that check permissions first (`requireAdmin`, `requireActiveViewer` in `src/lib/auth.ts`) and then use the direct DB connection in `src/db`.
- `src/proxy.ts` refreshes the session and redirects signed-out visitors. It is only an optimistic check.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run lint` / `npm run typecheck` / `npm test` / `npm run design-lint` | Checks run by CI |
| `npm run e2e` | Playwright smoke test on the local stack (needs `supabase:start`, `env:local`, `seed` and a synced catalog); runs its own dev server on :3100 |
| `npm run admin` | List, grant or revoke the admin by email |
| `npm run icons` | Redraw the app icons in `public/` |
| `npm run db:generate` / `npm run db:reset` | Migrations |
| `npm run env:local` / `npm run seed` | Local environment |
| `npm run sync` / `npm run regroup` | Catalog sync / rebuild product families |

## Catalog

The site is open for browsing. An account is needed only to order and for the admin area (see `src/proxy.ts`).

- `npm run sync` reads the Shopify suppliers (AndyMark, WCP, CTRE, The Thrifty Bot) into the database. `npm run sync -- wcp` syncs one.
- `.github/workflows/sync.yml` runs it daily. It needs a `DATABASE_URL` repository secret pointing at the production database.
- A failed or suspiciously small sync changes nothing and is recorded in `sync_jobs`.
- When it finishes, the workflow calls `POST /api/revalidate` so pages stop showing the cached catalog. That needs a `REVALIDATE_SECRET` (at least 16 characters) set both as a Vercel production environment variable and as a repository secret.
- Prices are the supplier's USD price × the Bank of Israel representative USD rate × 1.6 (no VAT), rounded to whole shekels (`src/domain/pricing.ts`). The daily sync fetches the rate into `exchange_rates` and keeps the last one if the fetch fails (`src/suppliers/boi.ts`, `src/lib/fx.ts`); orders keep the rate they were priced at (`team_order_items.usd_ils_rate`). Categories come from the rules in `src/suppliers/classify.ts`.

## Product families

The catalog lists families, not supplier products: one part in all its sizes, from every supplier that sells it (`docs/REDESIGN.md`, "Data model changes").

- After each supplier sync, `src/suppliers/families.ts` regroups the whole catalog. A supplier product with options is a family as it is. Flat WCP-style products ("36t Steel Spur Gear (20 DP, 1/2" Hex Bore)") group by their title with the sizes taken out (`src/domain/families/parse.ts`), and the same SKU at two suppliers merges their families.
- `npm run regroup` rebuilds families from the database without fetching. Run it after changing the grouping rules.
- Families live at `/catalog/p/<slug>`. Old product URLs (`/catalog/wcp/wcp-0749`) redirect there with that variant selected.
- Anything the rules aren't sure about stays on its own and is listed at `/admin/catalog/grouping`.
- Carts, orders and supplier POs still point at the supplier's variant, so ordering is unchanged.

## Ordering

- Anyone can build a cart. A guest's cart is kept in the browser and joins the team's cart at sign-in.
- The cart is a sheet (also at `/cart`) with one main action. A guest signs in there by email link (or Google, once it's enabled in Supabase) and creates the team if it's new. Anyone signed in to the team sends the quote request in one tap, with delivery and contact remembered from the last order.
- One kind of team account (D11): there are no roles. Every sign-in email on a team can build the cart, send requests, approve or reject quotes, cancel, and manage the team's account. A team may use one shared email or several; they are equal. The audit log keeps who sent or approved.
- A new team can send its first request while pending; the admin approves the team while reviewing it.
- Carts can be shared as links (`/cart/shared?items=...`).
- On the admin's order page, each of the team's sign-in emails gets a WhatsApp button and a copyable link to the quote. The link (`/q/<token>`) shows the quote with one Approve button and no sign-in. It's signed with `QUOTE_LINK_SECRET`, tied to that quote version, and expires after 14 days.
- Production env vars: `QUOTE_LINK_SECRET` (required for approval links), `TBA_KEY` (optional, fills in FRC team names).

## Teams, reports and backups

- Anyone on an approved team manages its account at `/team` ("חשבון הקבוצה"): the team's details and its sign-in emails. Adding an email makes a link they send themselves, valid for that email for two weeks. The last email can't be removed.
- `/admin/reports` covers sales, purchasing, import costs, turnaround and profit, with Excel export.
- `.github/workflows/backup.yml` backs up the database nightly. It needs a `BACKUP_PASSPHRASE` repository secret. `docs/admin-guide.md` covers restoring, and is the guide for running the site.
