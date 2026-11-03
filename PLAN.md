# FRC / FTC Purchasing Portal — Build Plan

Source spec: "מסמך איפיון אתר אינטרנט למכירת ציוד פירסט" v1.0 (3 Nov 2026).
Decision: we build and run it ourselves (not an RFQ to a dev company).
Users: FRC/FTC teams send order carts to the mentor (admin), who reviews them, quotes them and orders by hand on each supplier's site.

---

## 1. Supplier feasibility (checked 3 Nov 2026)

| Supplier | Platform | Public data source | Products | Variants | Variants w/o SKU | Currency |
|---|---|---|---|---|---|---|
| AndyMark | Shopify | `/products.json` | 1,964 | 6,193 | 0 | USD |
| WCP | Shopify | `/products.json` | 2,151 | 2,155 | 187 | USD |
| CTRE | Shopify (`store.ctr-electronics.com`) | `/products.json` | 302 | 813 | 32 | USD |
| The Thrifty Bot | Shopify | `/products.json` | 260 | 513 | 37 | USD |
| REV | BigCommerce | sitemap + product page (JSON-LD, `BCData`) | 391 pages | many per page (price ranges) | base SKU often null | USD |
| goBILDA | BigCommerce | sitemap + product page (JSON-LD, `BCData`) | 2,396 pages | some | — | USD |

Total: **~7,500 products / ~12,000+ variants.** That's small, so one Postgres instance and plain `ILIKE`/trigram search are enough; no search engine needed.

### What the data gives us
- **Shopify** (`products.json`, 250 per page, paginated): title, body HTML, `product_type`, tags, images, and per variant `sku`, `price`, `compare_at_price` (sale price), `available` (boolean only, **no stock quantity**), `grams` (weight), and options 1–3. A full sync takes about 10–30 requests per supplier. Bursts hit HTTP 429, so the adapter needs throttling and backoff.
- **BigCommerce**: no public bulk feed. The product sitemap lists URLs. Each page has JSON-LD plus `BCData` (SKU, price, stock behavior), but **variant SKUs and prices only appear when an option is selected**. The REV theme calls the Storefront GraphQL API with a token embedded in the page. That's technically possible but **should not be used without REV's permission**. goBILDA is the same platform.
- **Categories**: AndyMark has good `product_type` values. WCP, CTRE and TTB leave it empty, so we keep our own category mapping (rules on title/tags plus manual overrides).

### Consequences for the design
1. Availability is always a **boolean plus `checked_at`**. Show "available (checked DD/MM)" or "availability not verified". Never show a stock count.
2. **Variants with no SKU** (~250 on Shopify): use `supplier_variant_id` as the stable key and show "no supplier SKU" on POs together with the product name and options.
3. `compare_at_price` exists, so on-sale items should be priced from `price`, with the sale flagged for admin review on the quote (open item in §16).
4. `grams` exists, so items above a weight threshold get an "oversized/heavy" flag that prompts manual shipping review (open item in §16).
5. **One-click supplier carts for the mentor**: for Shopify suppliers the admin PO screen builds a cart permalink `https://<store>/cart/<variantId>:<qty>,<variantId>:<qty>,…` that opens the supplier's cart already filled. REV and goBILDA get a copy-paste SKU × qty list and an Excel export.
6. **Terms of use**: before going live, email each supplier asking permission to mirror catalog data and images, and ask REV and goBILDA for a feed or API. Until they agree, the BigCommerce suppliers use a **CSV/Excel import adapter**. Images are hot-linked to the supplier's CDN with a link back to the source page, not re-hosted.

### Sync adapter priority
1. Shopify adapter (one implementation covers 4 suppliers): MVP
2. CSV/Excel import adapter (any supplier, admin upload with column mapping): MVP
3. BigCommerce page adapter (sitemap → page JSON-LD/BCData, base price + "variant price checked on quote"): after permission
4. BigCommerce GraphQL adapter: only with an issued token

---

## 2. Stack

| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript, server actions + route handlers, hosted on **Vercel** |
| DB | **Supabase** Postgres + Drizzle ORM (migrations) + `pg_trgm` for SKU and partial search |
| Auth | **Supabase Auth** (email + password, email verification); team isolation through Row Level Security + server-side checks |
| Files | Supabase Storage (private buckets, signed URLs) |
| Sync and jobs | **GitHub Actions** scheduled workflow (`sync.yml`, daily): runs the supplier adapters against the DB. No timeout limits, free, and keeps the Supabase free project from pausing |
| Backups | GitHub Actions nightly `pg_dump` → Storage; monthly restore test |
| UI | Tailwind CSS (logical properties, `dir="rtl"`), shadcn/ui, SKUs in `<bdi dir="ltr">` |
| Documents | Printable HTML pages with print CSS (Hebrew RTL quote and delivery note; English PO) → browser "Save as PDF"; Excel via exceljs |
| Email | Resend + React Email templates |
| Tests | Vitest (domain core), Playwright (acceptance tests end-to-end) |
| Local dev | Supabase CLI (local Postgres + Auth in Docker), `pnpm dev` |

### Hosting and cost
| Stage | Setup | Cost |
|---|---|---|
| Build and test | Vercel Hobby + Supabase Free + Resend Free + GitHub Actions | $0 |
| Launch (the 1.6× markup probably counts as commercial use, which Hobby doesn't allow) | Vercel Pro + Supabase Free | $20/mo |
| Fallback if $20/mo is too much | Hetzner VPS with Docker/Coolify (Next.js + Postgres) | ~€4–5/mo, self-managed |

Plus a domain (`.co.il` or `.com`), paid yearly. Supabase Free limits: 500 MB DB (the catalog is tens of MB), pauses after 7 days idle (prevented by the daily sync), no backups (hence the dump job).

## 3. Repository layout

Single Next.js app, no monorepo:

```
src/app/(portal)/    team portal pages (he, RTL)
src/app/admin/       mentor back office
src/app/print/       printable quote / PO / delivery-note pages
src/db/              Drizzle schema + migrations, seed
src/domain/          pricing, status machines, quantity ledger (pure, unit-tested)
src/suppliers/       adapters: shopify, csv, bigcommerce-page; cart-link builders
src/emails/          React Email templates
scripts/sync.ts      entry point run by GitHub Actions
supabase/            local config, RLS policies
.github/workflows/   ci.yml, sync.yml, backup.yml
e2e/                 Playwright acceptance tests
```

## 4. Data model (Drizzle tables)

Identity
- `teams` (id, number, program FRC|FTC, name, contact, address, status pending|active|suspended)
- `users`, `memberships` (team_id, user_id, role team_admin|buyer|viewer), `invitations`
- System admins: `users.is_admin`

Catalog
- `suppliers` (id, code, name, base_url, adapter, adapter_config jsonb, active)
- `products` (supplier_id, supplier_product_id, title, description_html, category_id, url, images jsonb, program_tags[], status published|review|hidden, last_seen_at, missing_since)
- `variants` (product_id, supplier_variant_id, supplier_sku nullable, options jsonb, grams, price_usd, compare_at_usd, available bool nullable, checked_at)
  - unique `(supplier_id, supplier_variant_id)`; index trigram on `supplier_sku`, `title`
- `categories` (tree) + `category_rules` (supplier, match, category)
- `price_history` (variant_id, price_usd, compare_at_usd, available, observed_at)
- `sync_jobs` (supplier_id, started/finished, status, counts, errors jsonb)

Pricing
- `pricing_rules` (scope default|supplier|category|product, target_id, multiplier, round_to, min_price_ils, active_from/to)
- Resolution: product > category > supplier > default (1.6). Price is `round(price_usd × multiplier)`, but not below the minimum. Variants missing a price or marked for review cannot be ordered.

Orders
- `team_orders` (number, team_id, status, delivery_method pickup|ship, address, contact, notes, submitted_by/at)
- `team_order_items` (order_id, variant_id, qty, **snapshot**: supplier_sku, title, options, price_usd, multiplier, rule_id, unit_price_ils, priced_at)
- `quotes` (order_id, version, shipping_ils, notes, sent_at, status draft|sent|approved|superseded|rejected)
- `quote_lines` (quote_id, team_order_item_id, qty, unit_price_ils, change_reason)
- `quote_approvals` (quote_id, user_id, at, content_hash)

Purchasing and logistics: the quantity ledger
- `supplier_pos` (number, supplier_id, status, supplier_order_ref, ordered_at, purchase_total_usd, invoice doc)
- `po_lines` (po_id, variant_id, qty, unit_cost_usd)
- `po_allocations` (po_line_id, team_order_item_id, qty)
- `shipments` (po_id?, carrier, tracking, status), `shipment_items` (shipment_id, po_line_id, qty)
- `import_costs` (shipment_id, type customs|freight|broker|vat, amount_ils, vat_reclaimable bool, document_id)
- `receipts` / `receipt_lines` (po_line_id, qty_received, qty_damaged, location)
- `allocations` (receipt_line_id, team_order_item_id, qty)
- `deliveries` / `delivery_items` (allocation_id, qty), delivery note document, proof of delivery
- `documents` (owner type/id, kind, storage_key, team_id nullable for access control)
- `audit_log` (actor, entity, entity_id, action, before jsonb, after jsonb, at), written in the same transaction as the change

Ledger invariants (enforced in `packages/domain`, inside DB transactions with `SELECT … FOR UPDATE`):
- Σ po_allocations.qty per item ≤ approved quote qty
- Σ po_allocations.qty per po_line = po_line.qty
- Σ allocations.qty per receipt_line ≤ qty_received − qty_damaged
- Σ delivery_items.qty per allocation ≤ allocation.qty
- Lines are merged only with the same `variant_id`, never across variants
- A line's status is derived from the ledger (pending → ordered → in transit → received → allocated → delivered / short), not stored

## 5. Status machines

- Team order: `draft → submitted → in_review → quote_sent → approved → purchasing → delivering → completed`, plus `rejected`, `cancelled`
- Supplier PO: `draft → generated → ordered_manually → confirmed → shipped_partial|shipped → received`
- Any change to a sent quote creates a new version and returns the order to `quote_sent`. The team sees a diff and must approve again.

## 6. Screens

Team portal (Hebrew RTL): sign-up (team number, FRC/FTC, contact) → verify email → "waiting for approval"; home (search, suppliers, categories, recent orders); catalog (filters for supplier, program, category, availability; exact or partial SKU search; sorting); product page (variant picker, ILS price, availability with check date, link to source); cart (grouped by supplier, subtotal, "local shipping priced later"); submit request; my orders (status, lines, shortages, documents, history, quote approval); team settings (details, users, roles, invites).

Admin: dashboard (pending sign-ups, orders to review, quotes waiting, open POs, shipments, shortages); order review and quote editor; consolidation board (approved lines grouped by supplier → create or extend a PO, split, adjust); supplier PO (PDF/Excel in English, record the manual order and reference, purchase prices, invoice); shipments and customs; receiving (received, damaged, location, allocate); deliveries (pick, pickup or ship, partial delivery note); catalog and pricing (suppliers, sync runs and errors, rules, overrides, review queue); reports (sales, purchasing, shortages, turnaround, profit).

Profit report = revenue excluding VAT (sale price / 1.18) − purchase cost − import costs where `vat_reclaimable = false` (AT-10).

## 7. Milestones

The mentor orders by hand, so the MVP ends at M3. M4 logistics can start as simple per-line statuses (ordered → arrived → handed to team) and grow into the full ledger later.

**M0, Foundation (week 1)**
- Next.js app, local Supabase, Drizzle schema + migrations, seed (admin, 2 demo teams), Supabase Auth with verification + approval gate, RLS policies, RTL layout shell, GitHub Actions CI (lint, typecheck, Vitest), Vercel preview deploys

**M1, Catalog (weeks 2–3)**
- Shopify adapter + daily GitHub Actions sync (throttle, retry, concurrency group against double runs, "missing since" flags, failure email) for AndyMark, WCP, CTRE, TTB
- CSV import adapter for REV and goBILDA (temporary)
- Category mapping, pricing engine + rules UI, catalog/search/product pages

**M2, Ordering (weeks 4–5)**
- Cart, submitting requests with snapshots, admin review, versioned quotes, team approval, Hebrew PDFs (request, quote), emails
- Team management and roles, server-side checks on every query, team isolation tests (AT-01 to AT-05)

**M3, Purchasing (week 6)**
- Consolidation board, PO generation (PDF/Excel in English), one-click Shopify cart links + copy-paste lists for REV/goBILDA, recording manual orders (AT-06, AT-07)

**M4, Logistics (weeks 7–8)**
- Shipments, import costs, receiving, allocation, deliveries, delivery notes, shortage report (AT-08, AT-09)

**M5, Reports and launch (weeks 9–10)**
- Reports + Excel export, profit (AT-10), sync failure behavior (AT-11), PDF checks (AT-12), backup and restore drill, monitoring (Sentry), admin guide

## 8. Open decisions (owner: us)

1. Supplier permission emails (data and images): send this week; this blocks the REV/goBILDA adapters
2. Sale price policy: charge the sale price or the regular price?
3. Weight threshold for the "heavy item" flag
4. Cancellation policy after a supplier PO has been placed (and what happens to that team's merged quantity)
5. Email sending domain + branding; pickup address(es)
6. Should quote approval expire if prices change in the next sync?
7. Launch hosting: Vercel Pro ($20/mo) vs. Hetzner VPS (~€5/mo); decide before go-live
