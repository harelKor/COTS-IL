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

Local services:
- Supabase Studio (browse the DB): http://127.0.0.1:54323
- Mailpit (catches sign-up / verification emails): http://127.0.0.1:54324

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

## Catalog

The site is open for browsing. An account is needed only to order and for the admin area (see `src/proxy.ts`).

- `npm run sync` reads the Shopify suppliers (AndyMark, WCP, CTRE, The Thrifty Bot) into the database. `npm run sync -- wcp` syncs one.
- `.github/workflows/sync.yml` runs it daily. It needs a `DATABASE_URL` repository secret pointing at the production database.
- A failed or suspiciously small sync changes nothing and is recorded in `sync_jobs`.
- Prices are USD × 1.6, rounded to whole shekels (`src/domain/pricing.ts`). Categories come from the rules in `src/suppliers/classify.ts`.
