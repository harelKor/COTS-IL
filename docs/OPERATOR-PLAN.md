# Running COTS-IL without a developer: the plan (Nov 14, 2026)

**Goal:** for months, a mentor runs the whole business from `/admin`, with no code, SQL or scripts. The few tasks that can only happen on an outside dashboard (Vercel, Supabase, GitHub) get a step-by-step Hebrew guide inside `/admin`, and the mentor gets access to those accounts (user decision, Nov 14).

**Sources:** a read-only review of the code on Nov 14, 2026, covering:
- operator-facing text and rules still in code;
- outside services and their failure modes;
- order, team and catalog operations with no admin screen.

**User decisions (Nov 14):**
- Hand over the accounts to the mentor.
- Payments: track the status only (paid, amount, date), with no invoice field.
- Home photos: swapping them stays a developer task once a season. The home page doesn't change, apart from the text in M6.
- Still in force: no VAT, one kind of team account (D11), and the dark design.

## The biggest risks if nobody is around

1. **The Vercel Pro trial ends about Nov 21, 2026.** Without a card, the whole site stops. (M0, this week.)
2. **Failures are silent.** If the nightly sync, the backup, the exchange rate, emails or the daily digest stop, only the GitHub repo owner gets an email, and `/admin` shows nothing. (M1)
3. **The GitHub key behind "sync now" expires within a year,** and the admin only sees "set". (M1 shows the expiry date; M8 explains how to renew.)
4. **A vendor changes its website:** goBILDA and REV stop updating, and prices freeze without warning. (M1 warns; a fix to the page reading needs a developer.)
5. **Ordinary corrections need SQL:**
   - cancelling after approval, reopening, undoing a delivery;
   - fixing a team, moving an order, deleting test data. (M2, M4)
6. **Only one admin.** If they lose access to their email, the only way back is a command from a computer. (M1 warns; M8 documents the way back.)

## Tasks

Each task is one fresh session. Each session:
- reads CLAUDE.md and its own task;
- checks every item in the code before changing it;
- commits, merges to `main` and pushes, with any migration first;
- checks the deploy.

The order avoids files that the audit tasks (`docs/AUDIT-UX-PLAN.md`) are still changing.

### M0. Handing over the accounts (the owner, not a session; now)
- [ ] A card on Vercel before Nov 21, plus Spend Management with an alert email for the mentor.
- [ ] The mentor gets owner access, with 2FA and recovery codes, to:
  - the Vercel team `cots-il`;
  - the Supabase project `lzpxrlvtcxyoiuwkoaha`;
  - the GitHub repo `harelKor/COTS-IL` (and its email alerts for failed Actions).
- [ ] Check the Supabase plan. On the free plan a project pauses after 7 days without activity, and there are size limits.
- [ ] The mentor is added as a second admin at `/admin/settings/admins`.
- [ ] Store the backup passphrase (`BACKUP_PASSPHRASE`) with the mentor too. Without it, no backup can be restored.
- [ ] Complete the "Setup still needed" list in `docs/admin-guide.md`:
  - production SMTP in Supabase;
  - `RESEND_API_KEY` and `EMAIL_FROM` on a verified domain;
  - the business facts.

### M1. Health and alerts (Opus; can start now)
**One health list.** Pure logic in `src/domain/health.ts`, with tests. It feeds:
- a red/yellow banner on every `/admin` page;
- a "בריאות האתר" card on `/admin/settings/system`.

**What it checks:**
- **Per-supplier sync:** time since the last success, red after 36 hours. A job still "running" after 3 hours counts as failed.
- **Exchange rate:** yellow after 5 days, with a link to the manual override in pricing.
- **Backup:** when it last ran. `backup.yml` writes a status row to the DB.
- **Revalidate and the daily digest:** whether they succeeded. Today `sync.yml:49` swallows the digest's failure; record the outcome in the DB.
- **Emails:** failed emails in the last 7 days (from `audit_log`).
- **The GitHub key:** a real validity check and its expiry date (from GitHub's `github-authentication-token-expiration` header), yellow 30 days before.
- **Admins:** a warning while there is only one.

**Alerts and checks:**
- A daily watchdog in Vercel Cron (independent of GitHub Actions) runs the same checks and emails the admins when something turns red. It also covers the case where GitHub stops the scheduled jobs.
- `/api/health` for an outside uptime monitor; how to connect one goes in M8.
- When a vendor's sync fails, its parts show "המחיר ייבדק בהצעה" after N days, instead of an old price that looks valid.

**Done when:** stopping each of these on the local stack shows a red line in the banner and in the system card, and the watchdog sends an email.

**Done (Nov 14, 2026).** Checked on the local stack: a failed and a never-synced supplier, a stuck run, a failed backup, an old revalidate, a failed digest, a rejected GitHub key and a failed email each showed red in the banner and the card; the watchdog logged its email with email off. Left open:
- The owner adds `CRON_SECRET` in Vercel (admin guide, "Setup still needed"); until then the watchdog doesn't run.
- Stale prices ("ייבדק בהצעה"): the product page and options table (M1), and since T17 (Nov 14, 2026) family cards (`variantsOf`/`toCards` in `src/lib/catalog.ts`) and the search panel (`src/app/api/search/route.ts`), through `getStaleSupplierCodes()` read inside the cached readers. A card whose vendors are all stale shows no price; a card with some stale shows the range of the others; a chosen stale part shows "המחיר ייבדק בהצעה". A search row with some stale vendors still shows the family's range (done: only all-stale rows hide the price).
- On the product page a stale part shows the existing "no price, send a request" path, so it can't go straight into the cart. Keeping the add button for a stale price needs `family-view.tsx` (T7).

### M2. Order corrections (Opus; after T4)
- **Cancel by the admin at any stage, with a reason.**
  - It releases the lines on draft supplier orders.
  - It warns when lines are already ordered or shipped, and leaves those lines as surplus stock.
- **Reopen** a rejected or cancelled order.
- **Undo a confirmed delivery** and correct a received quantity in place.
- **Change a price or shipping on a locked quote** (once lines have been ordered), as a new version that goes to the team for approval.
- **Move an order to another team.**
- **Delete an order** that has no supplier order, shipment or delivery, for test data.
- **A part that's no longer sold:** a "לא זמין" mark on lines in an open order or a supplier order, with a "replace with another part" action.
- **Action history** on the order card, from `audit_log`.
- Everything goes through server actions with `requireAdmin`, and is written to `audit_log`.

### M3. Payment tracking (Sonnet; after M2)
- **Migration:** a paid status on the order (לא שולם, שולם חלקית, שולם), the amount, the date, the method (העברה, צ׳ק, מזומן, אחר) and a note.
- **Admin:** recording a payment from the order card, an "לא שולמו" filter, and payment columns in the Excel export.
- **Team page:** shows the payment status and the payment terms from business settings.
- No invoice and no VAT (user decision).

### M4. Team management (Opus; after T9)
- **Admin edits a team:** name, number, programme and contact.
- **Sign-in emails:** add or remove one from a team. The guard against removing the last one stays.
- **Transfer a team number** that the wrong person claimed: move the sign-ins, and an option to block an email.
- **Merge duplicate teams:** move the sign-ins, orders and carts.
- **Suspend and reactivate:** the `suspended` status exists, but nothing sets it today.
- **Delete** a team or user that has no orders, for test data such as "or", "rfrr", "ttt" and "fff".
- **A team page:** its orders, sign-ins, action history and payment status (after M3, or add it there).
- **A policy setting** in business settings: whether a team awaiting approval may already send requests. Today it may.

### M5. History, export and season close (Sonnet; after T4 and M2)
- `/admin/settings/audit`: the action history, with filters by type, person and date.
- Export to Excel: orders, teams and sign-ins, and the catalog with prices.
- **Season close:** archive the orders before a date, with an "archive" filter on the orders list. Nothing is deleted.

### M6. Text and messages from admin (Sonnet; after T4, T5 and T19)
- **Bug:** the approval link lasts 14 days (`QUOTE_LINK_DAYS`, `src/domain/quote-link.ts:11`) while the quote says it is valid for `quoteValidDays`. Make it follow `quoteValidDays`.
- **New info pages:** `/privacy`, `/terms` and the `/how-it-works` steps move into `INFO_PAGES` (they're JSX today), so they're edited like the other info pages.
- **Home page:** the motto and its sub-line, and the four "למה COTS-IL" cards, become editable in `content`. The text changes; the look stays exactly the same.
- **One site tagline** for the layout, the manifest, the OG image and the email footer.
- **Emails:** a subject and body per event, overriding the default (`src/lib/email-templates.ts`), with the existing tokens, a preview and a test send.
- **Timings and email routing:**
  - how long an invite lasts (`INVITE_DAYS`);
  - the reminder after N days (`REMINDER_AFTER_DAYS`);
  - per admin: which emails they get, or none.

### M7. Search and catalog tuning from admin (Opus; after T6)
- **Hebrew synonyms** (today `src/domain/search-synonyms.ts`): a simple editor, "מנוע = motor, falcon", in `content`.
- **Searches with no results:** a light log and a list in admin, with "add a synonym" or "request a part" from each line.
- **Accessory ranking:** the accessory word list and the main-item minimum price (`src/domain/catalog-rank.ts`) become editable.
- **The search panel's categories:** a flag on each category (today `SEARCH_CATEGORIES`).
- **Vendor order on the home page:** a number per supplier (today `FIRST_ROW`). The look stays the same.
- **New parts landing in "אחר":** keyword-to-category rules (today `CATEGORY_RULES` in `src/suppliers/classify.ts`), as a table in admin, plus a list of the parts in "אחר" with a quick category pick.
- **Buttons on the system page:** "קיבוץ מחדש" (regroup) and "סנכרון כל הספקים" (sync every supplier).

### M8. In-app help for the mentor (Sonnet; last, after M1–M7)
- `/admin/help`, in Hebrew:
  - a guide for each routine task (from request to delivery, a new team, a new vendor, prices, a new season);
  - for every red line in M1, what it means and what to do.
- **Guides for outside tasks, step by step:**
  - renewing the GitHub key, and where to paste it;
  - changing an env var in Vercel, then "Redeploy" from the dashboard, with no code;
  - restoring a backup;
  - getting back in when no admin can sign in (a short SQL in the Supabase SQL Editor);
  - connecting an uptime monitor to `/api/health`;
  - what to do when a vendor changes its site (hide it, or switch it to manual, until a developer arrives).
- Update `docs/admin-guide.md` to match, and fix CLAUDE.md where it has drifted (there's no more `/admin/catalog` or `VENDORS`).

## Still needs a developer, on purpose
- **The page reading for goBILDA and REV** when their site changes (`src/suppliers/bigcommerce.ts`). M1 warns, M8 explains the temporary workaround.
- **Seasonal home photos.**
- **Version updates and security fixes** (Next, React). Turning on Dependabot security alerts on GitHub is a one-time setting, so the mentor knows when to call.
- **The merge rules, sync thresholds and job times.**

## Order of work

M1 can start now (its files don't overlap the audit tasks). After it:
- M6 after T4, T5 and T19;
- M2 after T4, then M3;
- M4 after T9;
- M5 after M2;
- M7 after T6;
- M8 last.

| Task | Depends on | State |
|---|---|---|
| M0 Handing over the accounts | the owner | open |
| M1 Health and alerts | — | done (Nov 14): needs `CRON_SECRET` in Vercel; cards and the search price path left to T6 (see M1 below) |
| M2 Order corrections | T4 | not started |
| M3 Payment tracking | M2 | not started |
| M4 Team management | T9 | not started |
| M5 History, export, season close | T4, M2 | not started |
| M6 Text and messages | T4, T5, T19 | done (Nov 15): info pages, home words, tagline, email templates, timings and admin email routing are in `/admin/settings` (content, emails, admins) |
| M7 Search and catalog tuning | T6 | not started |
| M8 In-app help | M1–M7 | not started |
