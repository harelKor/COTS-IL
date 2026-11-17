# Site audit and improvement plan (Nov 17, 2026)

Four parallel checks:
- the team buying flow (code);
- the admin as a business (code);
- the live site as a guest (desktop and phone, dark and light, 15 pages);
- every open item in the existing plans.

These were spot-checked in code:
- there is no team payment tracking (`team_orders` has no paid fields);
- product pages are not in `sitemap.ts`;
- team order pages show no tracking numbers;
- there are no lists or budgets.

**Baseline:** the live site is technically clean. There is no horizontal scroll at 390px, no broken images, no images missing alt text, no console errors, and robots.txt, the sitemap and the security headers are fine. The gaps are trust, money and repeat-buying.

## Owner steps (no code; they block the most)

1. **Business facts** in `/admin/settings/business`: phone, email or WhatsApp, business number, address, payment terms, lead times. Every page that would show them is already built and hidden while they are empty. Today a guest has no way to reach a person, and no page says how payment works. This is the single biggest trust gap.
2. **Email:** `RESEND_API_KEY` and `EMAIL_FROM` in Vercel, plus Supabase SMTP. Until then, no quote, status or reminder email reaches a team.
3. **Vercel:** a card before the Pro trial ends (about Nov 21), `CRON_SECRET` (the watchdog), and an uptime monitor on `/api/health`.
4. **Access:** a second admin, and someone else holding the backup passphrase (M0).

## Build sessions, in order

| # | Session | What | Size | Why first |
|---|---|---|---|---|
| I1 | **Payments and balances** (M3) | Mark an order paid, partly or fully, with amount, date, method and an optional document number (חשבונית/קבלה no.). Per-team balance and an ageing list ("owes ₪X, 30+ days"). A "paid" state in the team's order timeline. A bookkeeper CSV. | M | The operator cannot tell today who owes what. It is the biggest money hole. |
| I2 | **Trust pages and SEO** | Payment terms, quote validity, cancellation and return of undamaged items in /shipping, /returns, /terms and /faq (as tokens from the business facts). Canonical tags on every static page. Product pages in the sitemap (about 4,000 families). FAQPage and store JSON-LD. Hebrew-first product titles and meta (a Hebrew category plus the English name). `noindex` on search URLs. Fix the heading order (the H1 comes after H2s on home and stores). | M | Cheap, and it turns search traffic and first-time visitors into requests. |
| I3 | **Documents for teams** | A print-ready quote and order summary (PDF via print CSS) on `/q/[token]` and `/orders/[id]`, with business details. A link to the admin's invoice or receipt once I1 stores the number. | S–M | Schools and sponsors need a quote PDF and an invoice to approve and reimburse. |
| I4 | **Lists, kits and budgets** (S12) | Named lists saved from a cart, "add list to cart" and "copy from last season". A team season budget with spent, committed and remaining shown on /orders and in the cart. | L | The top reason a team comes back each season. Already the planned next step. |
| I5 | **Tracking and "needed by"** | Tracking number and carrier on shipments, shown on team pages. A "needed by" date on the request, a warning when the vendor's lead time makes it late, and an "urgent / for event" flag the admin sees. | M | Teams buy against competition dates. |
| I6 | **Quote follow-up** | Quote expiry after `quoteValidDays`, with a "quote expired, re-quote" action. Per-line notes on a quote and asking a question on a quote. Reminders: quote expiring, approved but unpaid (needs I1). An admin-cancel email to the team (M2). | M | Quotes sit forever today, and approval is all-or-nothing. |
| I7 | **Margin truth** | Quoted rate against purchase rate per order and per supplier order, and import costs (customs, freight) spread over orders and lines, both in the profit report. | M | A rise in the dollar or customs on heavy parts can erase the ×1.6 unnoticed. |
| I8 | **Admin tools** | An audit-log viewer with filters (M5). Inbox search by tracking number, supplier order number or SKU. Bulk mark-paid and bulk archive. Season close and archive. An order export with line detail. | M | Needed once there are two admins and a full season of orders. |
| I9 | **Stock alerts and substitutes** | "Tell me when it's back" and price-drop alerts on the product page. "Same part from another vendor" when a part is out of stock or a quote line is dropped. | M | Needs email (owner step 2). |
| I10 | **Small wins** | WhatsApp or `navigator.share` on the product page and the quote ("send to the treasurer"). FRC or FTC as the team's default for the vendor order. A spend CSV for teams. Per-vendor OG images. | S | Each is a few hours. |

## Leftovers from earlier plans worth bundling

- **Speed:** S-1 is still on branch `claude/speed-paint-5f0259`, not merged; also S-2, S-4 and S-5 from `AUDIT-2026-11-14.md`, and T15 (B-3 to B-11). The cold home TTFB was about 3s and LCP was 3.6–4.3s. One session.
- **UX T8, T11–T14, T16** (`AUDIT-UX-PLAN.md`): the variant picker, the admin order page, the catalog tools, and polish.
- **Catalog data:** DP ≥90% coverage in Gears, and motor fit in Gears (CF1).
- **Not tried by a person yet:**
  - the team flow on a real phone;
  - the iPhone flyout fix;
  - the admin cards and order delete on production;
  - "Install the app".
- **Decisions only the owner can make:**
  - written OK from goBILDA and REV;
  - the Oracle self-hosting branch;
  - Vercel Image Optimization;
  - backorders showing as available at AndyMark and The Thrifty Bot.

## Suggested order

Owner steps 1–3 now. Then I1 → I2 → I3 (money and trust, about one week of sessions), then I4 (the season feature), then I5–I8 as the season starts, with I9 and I10 once email is on.
