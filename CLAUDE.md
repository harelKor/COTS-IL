@AGENTS.md

# COTS-IL

A Hebrew (RTL) purchasing portal for FRC/FTC teams. Teams build carts from AndyMark, WCP, CTRE and The Thrifty Bot; the Israeli supplier (the admin) quotes, orders from each supplier by hand, receives and delivers. Live at https://cots-il.vercel.app.

Read first:
- `docs/REDESIGN.md`: the redesign plan. Work goes one phase per session (its "Roadmap" section).
- `docs/REDESIGN-AUDIT.md`: routes, schema, the audit items mapped to files, and the open decisions (D1–D9).
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
npm run db:generate      # migration from src/db/schema.ts
npm run db:reset         # rebuild local DB from migrations, then seed again
npm run sync             # sync Shopify suppliers (npm run sync -- wcp for one), then regroup families
npm run regroup          # rebuild product families from the DB, no fetching
```

## Rules that don't change

- Writes go only through server actions that check permissions first (`requireAdmin`, `requireActiveViewer` in `src/lib/auth.ts`). RLS is read-only.
- `variants.id` is the key that carts, order items and POs point to. Never break it; order items keep their own snapshot.
- The catalog lists `product_families` (`/catalog/p/<slug>`), rebuilt from products and variants after every sync. Families hold nothing that isn't derived; grouping rules live in `src/domain/families`.
- Production migrations are applied by hand (`npx supabase db push`), and every push to `main` deploys production. Apply a migration before merging code that needs it.
- Prices: `src/domain/pricing.ts` only. Availability is yes/no plus its check date, never a stock count.
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
| Type scale | 48/40 hero, 28 page title, 20 section, 17 body, 13 caption; headlines 600, tracking −0.02em |
| Light | background #FBFBFD, surface #FFFFFF, text #1D1D1F, secondary #6E6E73, hairline #D2D2D7, accent #0071E3 |
| Dark | background #000000, surface #1C1C1E, text #F5F5F7 |
| Status | green #1E8E3E, amber #B26A00, red #D70015 |
| Cards | no border, image on a #F5F5F7 tile, radius 18, hover lift 2px + soft shadow |
| Buttons | pill (radius 980), 44px tall; accent fill for the one primary action, plain text for the rest |
| Header | sticky, translucent with backdrop blur, 52px, hairline bottom border |
| Motion | 200–300ms ease-out fades, spring for sheets and the stepper; none under `prefers-reduced-motion` |
| Icons | Lucide line icons, 20px, never the only label on a primary action |
| Spacing | 8px grid; page margins 24 mobile, 48+ desktop; max content width 1200 |

Tokens live as CSS variables in `src/app/globals.css` (light, dark and print) and are exposed to Tailwind through `@theme inline`.

## Click budget

Known part: 1 click to add, 3 from search to a sent order. A part with options: 2 clicks. Order again and approve quote: 1 click each. Never navigate away to add to the cart, no confirm dialogs (use an Undo toast), and never ask for something the app can work out. See "Click budget" in `docs/REDESIGN.md`.
