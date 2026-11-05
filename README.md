# BeniAdam: FRC / FTC purchasing portal

Teams build carts from AndyMark, REV, WCP, CTRE, goBILDA and The Thrifty Bot, then send them to the mentor, who reviews, quotes and orders from each supplier. See [PLAN.md](PLAN.md) for the full plan.

Stack: Next.js 16 (App Router) · Supabase (Postgres, Auth, Storage) · Drizzle ORM · Tailwind (Hebrew RTL) · Vitest.

## Local setup

Requirements: Node 24+, Docker Desktop (running).

```bash
npm install
npm run supabase:start   # local Postgres + Auth + Mailpit in Docker (first run downloads images)
npm run env:local        # writes .env.local from the running stack
npm run seed             # mentor, two demo teams, six suppliers
npm run dev              # http://localhost:3000
```

Local services (on 544xx ports, so they never clash with another local Supabase project on the defaults):
- Supabase Studio (browse the DB): http://127.0.0.1:54423
- Mailpit (catches sign-up / verification emails): http://127.0.0.1:54424

Seeded logins (`*@beniadam.test`) all use `SEED_PASSWORD` from `.env.local`:
- `mentor@beniadam.test`: admin
- `frc1690@beniadam.test`: approved FRC team
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
| `npm run lint` / `npm run typecheck` / `npm test` | Checks run by CI |
| `npm run db:generate` / `npm run db:reset` | Migrations |
| `npm run env:local` / `npm run seed` | Local environment |
| `npm run sync` / `npm run regroup` | Catalog sync / rebuild product families |

## Catalog

The site is open for browsing. An account is needed only to order and for the admin area (see `src/proxy.ts`).

- `npm run sync` reads the Shopify suppliers (AndyMark, WCP, CTRE, The Thrifty Bot) into the database. `npm run sync -- wcp` syncs one.
- `.github/workflows/sync.yml` runs it daily. It needs a `DATABASE_URL` repository secret pointing at the production database.
- A failed or suspiciously small sync changes nothing and is recorded in `sync_jobs`.
- Prices are USD × 1.6, rounded to whole shekels (`src/domain/pricing.ts`). Categories come from the rules in `src/suppliers/classify.ts`.

## Product families

The catalog lists families, not supplier products: one part in all its sizes, from every supplier that sells it (`docs/REDESIGN.md`, "Data model changes").

- After each supplier sync, `src/suppliers/families.ts` regroups the whole catalog. A supplier product with options is a family as it is. Flat WCP-style products ("36t Steel Spur Gear (20 DP, 1/2" Hex Bore)") group by their title with the sizes taken out (`src/domain/families/parse.ts`), and the same SKU at two suppliers merges their families.
- `npm run regroup` rebuilds families from the database without fetching. Run it after changing the grouping rules.
- Families live at `/catalog/p/<slug>`. Old product URLs (`/catalog/wcp/wcp-0749`) redirect there with that variant selected.
- Anything the rules aren't sure about stays on its own and is listed at `/admin/catalog/grouping`.
- Carts, orders and supplier POs still point at the supplier's variant, so ordering is unchanged.

## Teams, reports and backups

- Team admins manage users and details at `/team`. An invitation is a link they send themselves, valid for the invited email for two weeks.
- `/admin/reports` covers sales, purchasing, import costs, turnaround and profit, with Excel export.
- `.github/workflows/backup.yml` backs up the database nightly. It needs a `BACKUP_PASSPHRASE` repository secret. `docs/admin-guide.md` covers restoring, and is the guide for running the site.
