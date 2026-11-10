# COTS-IL improvement plan (UX, conversion, platform)

Nov 10, 2026. Written from a full audit of the code at `037f8c2` and a walkthrough of https://cots-il.vercel.app as a customer (desktop and 375px phone). It follows the redesign phases 0–4 in [REDESIGN.md](REDESIGN.md) and replaces its phase 5 prompt: phase 5's pages and admin work are sessions 4, 10 and 11 below.

## How to run this plan in Claude Code

1. One session per numbered session below, in the order of the roadmap table. Each session starts with: "Read CLAUDE.md, docs/IMPROVEMENT-PLAN.md (only section S<n> and 'Rules for every session'), then the files it names."
2. Sessions marked **Plan first** start in plan mode and get a yes before code.
3. Every session ends with: `npm run lint && npm run typecheck && npm test`, screenshots at 360px and 1280px of every screen it touched, the click counts it changed, a commit on its branch, and a tick in the Progress table at the end of this file.
4. Sessions in the same "track" column of the roadmap touch different files and can run in parallel worktrees. Sessions in one track run in order.
5. Production: never deploy by hand; a push to `main` deploys. Migrations go to production with `npx supabase db push --remote` from the main checkout, with the user's OK, before the code that needs them merges.

### Rules for every session

- Everything in CLAUDE.md still holds: RTL logical properties, `<Ltr>` for part names and SKUs, `formatIls` unwrapped, 44px tap targets, 360px without horizontal scroll, light only, no `·` between metadata, no confirm dialogs (Undo toast instead), pure logic in `src/domain` with Vitest tests.
- Do not bring back pasting a SKU list or dropping a BOM file into the cart, or the dark theme.
- **One kind of team account (D11, Nov 10, 2026).** There are no student, mentor or viewer roles. Everyone signed in to a team can do everything for it: build the cart, send requests, approve or reject quotes, cancel, edit the team's details and add or remove the team's sign-in emails. A team may use one shared email or several; they are equal. Copy says "הקבוצה" / "חשבון הקבוצה", never מנטור/ית, סטודנט/ית or צופה. Session S0 makes this true in the code; later sessions assume it.
- Business facts that aren't known yet (fees, lead times, legal name, phone, WhatsApp, pickup address, return policy, email domain) go through one file, `src/lib/business.ts`, created in S4. Until the user fills it, each value is `null` and the UI hides the sentence or shows a `TODO` marker only in development.
- Check this Next.js version's docs in `node_modules/next/dist/docs/` before using caching, `connection()`, `after()`, metadata routes or `error.tsx`.

## The customer's view in one page

COTS-IL already does the hard part well: one catalog across four suppliers, families with option chips, ₪ prices with VAT, a supplier price comparison, a cart that is a sheet, a guest cart, a 1-tap send for a returning team, a signed approve link, and clean RTL. The audit found no `ml-`/`mr-`, no `dark:` and no `·` anywhere.

What stops a team from buying today, in the order they meet it:

| Stage | What the customer meets | Severity |
|---|---|---|
| Landing | Who is selling? No footer, no business name, no contact, no lead time, no "what does the price include". WCP's own store now offers Israel as a shipping country, so "why order through you" must be answered on the first screen | P0 |
| Search | Hebrew words return nothing ("מיסב", "מנוע", "גלגל שיניים": 0 results on a Hebrew site). Typos return nothing ("krakn x60"). A SKU from a family (e.g. a WCP gear SKU) opens the family with nothing selected. Each keystroke costs 450–1,600 ms (no HTTP caching) | P0 |
| Catalog | "Ships from Sydney" AndyMark listings appear as duplicates of the real parts. The "More filters" sheet and mobile filter popovers close after every tap. Spec filters can match a family where no single part has both values. On a phone the in-card size picker is a cramped see-through overlay. Default sort is alphabetical (a ₪600 bevel bundle leads "Gears") | P1 |
| Product page | Supplier text in English with the supplier's own promos, US list price ("MSRP $399.99… FRC discount $217.99") and "contact sales@ctr-electronics.com". No delivery time where the decision is made. Quantity can't be typed | P1 |
| Cart | Errors and Undo show in a toast that sits under the modal sheet, so a failed send just "does nothing". A blocked line is never named. Send and total scroll away on long carts | P0 |
| Sign-in | The email link only works in the same browser (fails from Gmail's in-app browser, another device, or the installed app) and the guest cart is lost. The default Supabase email is English and rate-limited unless custom SMTP is set | P0 |
| Roles | Students build, mentors send and approve, viewers only look: three roles, a WhatsApp handoff between them, and "only a mentor can…" errors. Decided Nov 10: one kind of team account instead (D11, session S0). The shared-cart page's only button also adds everything again, so lines already in the cart double | P0 |
| After sending | No confirmation email, no "quote within N days", and no message at any later stage. The admin isn't told about new requests either | P0 |
| Quote | The approve-link page shows less than the order page (no changes or reasons). "Ask for a change" means "reject". No quote PDF with the business's details for school procurement | P1 |
| Tracking | Stages without dates or ETA, two status vocabularies on one page, no "ready for pickup", cancel is one tap with no Undo | P1 |

The admin side has well-prefilled forms but no inbox, no notifications and hard-coded pricing (USD × 1.6). The platform has no footer, sitemap, robots, JSON-LD, `error.tsx`, analytics, error tracking, email sender or DB timeouts.

## Benchmark: what the best stores do, and what we adopt

| Pattern | Who does it best | COTS-IL today | Adopt (session) |
|---|---|---|---|
| Delivery promise on every product and in the cart ("Arrives Thu") | Amazon, Apple ("Delivers Nov 14, pickup today") | Nothing | Per-supplier lead time shown on cards, product page, cart and quote: "Arrives in Israel in about N weeks" (S4, S7) |
| Search that forgives: typos, plurals, synonyms, the shopper's language, SKU in any format | Amazon, McMaster-Carr, DigiKey | Exact English substrings only | Hebrew synonyms and category names, plurals, normalised SKUs, trigram fallback, SKU opens the exact variant (S5) |
| Instant search under 100 ms | McMaster-Carr | 450–1,600 ms per keystroke | CDN-cached search API, slimmer query (S5, S9) |
| Parametric filtering that narrows as you choose, with counts | DigiKey, McMaster-Carr | Filters per family, counts hidden, values that lead to 0 | Variant-level filters, disjunctive counts, zero values disabled (S6) |
| Dense table view with a quantity field and "Add" on every row | McMaster-Carr | Options table rows only link | "All options" table with typed quantity and Add per row (S7) |
| Typed quantity everywhere | McMaster-Carr, DigiKey, Amazon (dropdown + type) | +/− only (50 rivets = 49 taps) | Numeric input in every stepper (S1) |
| "Frequently bought together", add all in one tap | Amazon | Companions for gears, belts, wheels, bearings, shafts only | Companions for motors, swerve, electronics; "add all" row (S7) |
| Clear "what happens next" after purchase, with email confirmation | Apple, Amazon, Shopify | Success screen with no timing; no email | Confirmation screen and email with quote ETA, order link, contact (S1, S3) |
| Order tracking with dates and proactive notifications | Amazon, Apple | Stages without dates; no messages | Dated timeline, ETA, email at each stage, "ready for pickup" (S3, S8) |
| Buy Again | Amazon | "Order again" on home (2 taps) | 1 tap when the cart is empty; uses quoted quantities (S8) |
| Approvals and purchase orders for organisations | Grainger, McMaster-Carr, Amazon Business | Approve link (good); "change" = reject; no PDF | "Request a change", undo window, quote PDF with business details and validity (S8) |
| Saved lists / project BOMs | DigiKey (BOM manager, lists), Amazon (Lists) | None | Team lists per subsystem ("Drivetrain 2027"), add list to cart (S12) |
| Spec tables, CAD and docs one tap away | WCP, CTRE, AndyMark | Docs links scraped (some with `&amp;`), specs not per variant | Variant specs, clean doc links, CAD button (S7) |
| Footer with policies, contact and the seller's identity | All of them; required by Israeli consumer law for distance selling | No footer | Footer, info pages, WhatsApp contact (S4) |
| Calm visual hierarchy, one primary action | Apple | Mostly there; primary buttons use flat `bg-brand` instead of `.btn-brand`; two card styles | One `Button` and one `Card` (S11) |
| Fast pages, measured | Apple, Amazon | Not measured; product page fully dynamic; first-row images lazy | Speed Insights, eager LCP images, cached product shell (S9) |

## Roadmap

| # | Session | Track | Depends on | Impact | Plan first |
|---|---|---|---|---|---|
| S0 | One kind of team account (no roles) | A | none | P0 (decision) | no |
| S1 | Cart sheet that never fails silently | A | S0 | P0 | no |
| S2 | Sign in without leaving the page | A | S1 | P0 | yes |
| S3 | Notifications (email first) | B | S4 (business file), user: email domain + Resend key | P0 | yes |
| S4 | Trust: footer, info pages, home sections, price explanation | C | user: business facts (TODOs allowed) | P0 | no |
| S5 | Search that finds things | D | none | P0 | yes |
| S6 | Catalog listing fixes | D | S5 (shares `catalog.ts`) | P1 | no |
| S7 | Product page | E | S4 (lead times) | P1 | no |
| S8 | Quote, approval, tracking, team | B | S3 | P1 | yes |
| S9 | Performance, reliability, SEO, observability | F | none (do the DB timeouts first) | P1 | no |
| S10 | Admin inbox and notifications | B | S3 | P1 | yes |
| S11 | Design system and accessibility pass | G | after S1, S6, S7 merge | P2 | no |
| S12 | Beyond parity: lists, season kits, budgets | H | S1–S8 | growth | yes |

Fastest path to "a team can buy without asking a question": S0 → S1 → S4 → S5 → S2 → S3. S0 goes first because S1, S2, S3 and S8 all touch the code it simplifies. S9's DB timeouts are a 10-minute fix that should ride along with whichever session goes first.

---

## S0. One kind of team account (no roles)

**Goal:** decision D11. A team account is the team: anyone signed in to it can build, send, approve, cancel and manage it. No student, mentor or viewer anywhere in the UI, the copy or the permission checks.

What exists today (D2 and D4 in [REDESIGN-AUDIT.md](REDESIGN-AUDIT.md), now superseded):
- Roles `team_admin` (mentor), `buyer` (student), `viewer` in the `team_role` enum (`src/db/schema.ts:21`), stored on `memberships.role` (`:77`) and `team_invitations.role` (`:608`).
- Checks: `canOrder`, `canSendRequest`, `canApproveQuote` (`src/domain/orders.ts:14-18`), `canManageTeam`, `wouldLeaveNoAdmin`, `ROLE_LABELS` (`src/domain/teams.ts`); used in `src/app/cart/actions.ts:29,117`, `src/app/orders/actions.ts:39,91`, `src/app/team/actions.ts:15-22,109-145`, `src/components/site-header.tsx:30` (cart mode `readonly`).
- Cart sheet: `isMentor` on the cart team, `MentorSend` vs `StudentSend` with the WhatsApp handoff (`src/components/cart-panel.tsx:274-285, 384-387`).
- Approve links go to members with `role = team_admin` only (`src/lib/quote-links.ts:42,73`); the admin order page lists one WhatsApp button per mentor (`src/app/admin/orders/[id]/approve-links.tsx`).
- Copy with מנטור/ית, סטודנט/ית or צופה in 10 files: `src/app/admin/orders/[id]/page.tsx`, `src/app/auth/actions.ts`, `src/app/cart/actions.ts`, `src/app/orders/actions.ts`, `src/app/orders/[id]/page.tsx`, `src/app/pending/page.tsx`, `src/app/team/page.tsx`, `src/components/cart-panel.tsx`, `src/domain/teams.ts`, `src/lib/quote-links.ts`; plus README.md ("Ordering") and docs/admin-guide.md.

Tasks:
1. Domain: delete `TeamRole`-based checks (`canOrder`, `canSendRequest`, `canApproveQuote`, `canManageTeam`, `wouldLeaveNoAdmin`, `ROLE_LABELS`). Membership in a team whose status allows ordering is the only permission. Keep one guard: a team can't remove its last sign-in email. Update `orders.test.ts` and `teams.test.ts`.
2. Server actions: `requireOrderingTeam` checks membership and team status only; `sendQuoteRequest`, `decideQuote`, `cancelOrder` and every `/team` action accept any member. Keep the audit log `actorId`, so the admin still sees who sent or approved.
3. Approve links: one signed link per member email (D4 otherwise unchanged: tied to quote version, content hash and member, re-checked under lock, recorded against that member). The admin order page shows the team's emails, each with WhatsApp and copy.
4. Cart sheet: one send component (rename `MentorSend` to `TeamSend`), remove `StudentSend`, the WhatsApp handoff, `isMentor` and the `readonly` cart mode. "שיתוף הסל" stays as a plain link.
5. `/team` becomes "חשבון הקבוצה": team details, the list of sign-in emails with "הוספת כתובת" and "הסרה" (no role column, no role select in invites), a line explaining that every email on the account can order and approve. Invitations carry no role.
6. Copy: replace every מנטור/ית / סטודנט/ית / צופה with the team ("ההצעה ממתינה לאישור הקבוצה", "קבוצה רשומה כבר: בקשו ממי שרשם/ה אותה להוסיף את הכתובת שלכם").
7. Database, in two steps so nothing breaks mid-deploy: (a) this session: code stops reading `role`; new rows still write `team_admin`; a migration sets every existing `memberships.role` and open `team_invitations.role` to `team_admin`, so old links and checks keep working. (b) A later cleanup (after one deploy): drop the `role` columns and the `team_role` enum. Apply each production migration with the user's OK, before the code that needs it merges.
8. Docs: add D11 to REDESIGN-AUDIT.md (supersedes D2, amends D4); update README "Ordering", docs/admin-guide.md and CLAUDE.md wherever they describe roles.

Acceptance: `grep -rn "מנטור\|סטודנט\|צופה\|team_admin\|buyer\|isMentor" src` returns only the migration and the schema enum (until step 7b); a second email on a team can send and approve on the local stack; an approve link reaches every team email; tests updated and passing.

Prompt:
```
Read CLAUDE.md and docs/IMPROVEMENT-PLAN.md (Rules for every session, and S0). Implement S0 tasks 1–8 (step 7a only; list 7b as a follow-up). Verify each file reference before editing. Test on the local stack with the seeded team plus a second email added to it: both can add, send, approve and manage. Ask me before applying the migration to production.
```

## S1. Cart sheet that never fails silently

**Goal:** every cart action gives visible feedback inside the sheet; nothing doubles, disappears or rubber-bands; the send button is always in reach.

Findings, verified in code:
- `<Toaster/>` is a plain fixed div in `src/app/layout.tsx:42`; the cart sheet and search panel open with `showModal()` (`src/components/cart-pill.tsx:65`, `search-panel.tsx:54`). Modal dialogs live in the top layer and make the rest inert, so every toast (Undo, send errors, rate limits, "already registered", merge results) is hidden and unclickable while the sheet is open.
- Blocked lines: `getCart` returns `available`, `checkedAt`, `variantMissing`, `productStatus` (`src/lib/orders.ts:22-30`) but `site-header.tsx:37-47` drops them; `createOrder` refuses the whole cart with a generic message (`src/app/cart/actions.ts:156-159`). A null price says "ייבדק בהצעה" in the sheet (`cart-panel.tsx:71`) yet blocks the send.
- Shared-cart links double quantities: `/cart/shared?items=…` has one button, `AddAll` (`src/app/cart/shared/add-all.tsx`), which calls `addToCartNow` per line; `addOptimistic` sums (`cart-store.ts:104-112`) and the server upsert sums, so lines already in the cart double. (The student → mentor WhatsApp handoff that used this link is removed in S0.)
- Guest cart is cleared before `mergeCart` resolves (`src/components/cart-sync.tsx:18-19`).
- `sent` state never resets (`cart-panel.tsx:297,309`): after one send, a new cart shows "הבקשה נשלחה".
- Every tap calls a server action that `refresh()`es the whole route (`cart/actions.ts:55,67,81,91`); `CartSync` then replaces the optimistic store, so fast taps jump back (2, 3, 4).
- Quantity is +/− only (`qty-stepper.tsx`); no remove button when qty > 1 except a touch-only swipe; the stepper is 36px on cards.
- Send and total sit at the end of the scrolling list (`cart-pill.tsx:96-98`).
- A user in two teams gets an arbitrary one: memberships query has no `ORDER BY` (`src/lib/auth.ts:38-42`), `orderingTeam` takes the first.

Tasks:
1. Toaster above dialogs: render the toast container with `popover="manual"` and call `showPopover()` whenever a toast appears (top layer stacks above an open modal), or portal it into the open dialog. Pause the timer on hover and focus; stack two toasts instead of replacing. Undo button 44px with readable contrast (`text-brand-soft`, not `text-brand` on navy).
2. Inline errors: in `TeamSend` (renamed in S0), `SignInStep`, `TeamStep` show the server error in a `role="alert"` block directly above the primary button. Keep the toast as a second channel.
3. Line state: carry `orderable`, `available`, `checkedAt` into `CartSheetLine`. Show "לא ניתן להזמין עוד" with a Remove button, and "לא זמין אצל הספק, נבדק <date>" (still sendable). `createOrder` returns the ids of blocked lines. Replace "ייבדק בהצעה" with the truth.
4. Sticky sheet footer: total, primary button and one status line pinned at the bottom; header "סל הקבוצה, <team name> <number>" with item count.
5. Quantity: `QtyStepper` gets a numeric input (`inputMode="numeric"`, commit on blur/Enter, clamp 1–9999). Every line gets an explicit remove (trash) button; remove keeps Undo. Unit price "₪X ליח׳" under the line total when qty > 1. Group lines by supplier with small headers.
6. No rubber-banding: debounce quantity writes per line (300 ms); server actions return the changed line(s) and the client applies them; drop `refresh()` from `quickAdd`, `setCartQty`, `removeFromCart`; ignore server snapshots older than the latest local mutation (mutation counter). Surface action failures (toast + revert).
7. Shared carts: on `/cart/shared`, mark lines already in the visitor's own cart ("כבר בסל") and use "set to max(qty)" semantics, not sum; the success toast waits for the server.
8. Merge safety: clear the guest cart only after `mergeCart` succeeds; return `{ added, skipped: [titles] }` and show skipped lines inline; keep local lines visible while merging (no "הסל ריק" flash); one `INSERT … SELECT … ON CONFLICT` in a transaction instead of a loop.
9. Reset `sent` when the sheet closes or the cart gains lines. The success state shows: request number, "הצעת מחיר תוך <N> ימי עסקים" (from `business.ts`, hidden if null), "נעדכן במייל", link to the order, "המשך קנייה".
10. Stale-cart guard: the send carries a hash of the lines the sender saw (another person on the same team account may have changed the cart); if the DB cart differs, refuse with "הסל השתנה" and show the change.
11. Multi-team: order memberships deterministically; add a team switcher (cookie, validated in `requireOrderingTeam`) shown only to users in more than one team.
12. Share: `navigator.share` on phones, copy elsewhere.

Acceptance: an injected send error is visible and readable with the sheet open; Undo after removing a line works inside the sheet; opening a shared-cart link never doubles quantities; tapping + five times quickly ends at exactly +5 with no jumps; a 20-line cart shows Send without scrolling; Vitest for the merge/set semantics and the stale-cart hash.

Prompt:
```
Read CLAUDE.md and docs/IMPROVEMENT-PLAN.md (Rules for every session, and S1). Implement S1 tasks 1–12 in order, committing after each group (1–2, 3–4, 5–6, 7–8, 9–12). Verify each finding in the code before changing it. Pure logic (merge/set semantics, cart hash, line state) goes in src/domain with Vitest tests. Finish with screenshots of the cart sheet at 360px and 1280px: empty, a blocked line, an error, 20 lines, after send.
```

## S2. Sign in without leaving the page (Plan first)

**Goal:** a first-time team goes from a full cart to a sent request without switching apps or losing the cart, in about 6 taps.

Findings:
- `sendEmailLink` uses `signInWithOtp` with a redirect (`src/app/auth/actions.ts:96-99`); PKCE makes the link work only in the same browser, and the guest cart lives only in that browser's localStorage. On failure `/auth/confirm` drops `next` (`src/app/auth/confirm/route.ts:23`).
- No email templates in `supabase/config.toml`: the email is Supabase's English default. Custom SMTP in production is unverified (the built-in sender allows a few emails per hour).
- A new team is asked for delivery, contact name and phone after creating the team (`getCheckoutDefaults` returns nulls for email-link users, `src/lib/orders.ts:158-164`), breaking "team number + email only".
- `/login` links to the legacy 8-field password signup (`src/app/signup/signup-form.tsx`); team number limits differ (99999 in `lib/validation.ts:26` vs 999999 in `auth/actions.ts:117`).
- Header "כניסה" has no `next` (`site-header.tsx:55`); sign-in from the header always lands on `/`.
- Team lookup fires per keystroke with no debounce or abort (`cart-panel.tsx:212-218`), and stale state blocks replacing an auto-filled name.
- A pending team can't add sign-in emails (`team/page.tsx:23-24`, `lib/invitations.ts:23,38`), so nobody else on a new team can sign in until the admin approves it.
- `siteUrl()` falls back to `http://localhost:3000` (`src/lib/quote-links.ts:9`, `auth/actions.ts:13`, `team/actions.ts:34`).

Tasks:
1. Email code in the sheet: after the email step, show a 6-digit code field (`verifyOtp({ type: "email" })`) with paste support and autofill (`autocomplete="one-time-code"`); keep the link as a fallback. Hebrew email template with both `{{ .Token }}` and the link (`supabase/templates/`, wired in `config.toml`; production template set in the Supabase dashboard by the user).
2. Cart survives another browser: store the guest cart server-side keyed by a random id when the email is sent (or encode it in `next=/cart/shared?items=…&cart=open`), and restore it after sign-in anywhere. Keep `next` on the error redirect and explain "the link was opened in another browser; enter the code instead".
3. One sign-up path: `/signup` becomes the same two steps as the sheet (email/Google, then team). Team step asks program, number, name (auto-filled), and a contact name and phone for the team (saved to `teams`, so the first send needs nothing more). One team-number limit in `src/domain/teams.ts`.
4. Debounce the team lookup (300 ms) with `AbortController`; replace the name only while it is still the auto-filled one. A taken team number offers "בקשת הצטרפות" (emails the team's account and the admin; one tap on the email adds this address) instead of a dead end.
5. Header "כניסה" passes the current path as `next`. "Link sent" state offers resend (with cooldown), change address, and "check spam".
6. Pending teams can add sign-in emails; invitations offer the email code/link as the main path, and an already-accepted invite shows "הצטרפתם ל<team>" instead of "invalid".
7. One `siteUrl()` in `src/lib/site-url.ts` with a `VERCEL_PROJECT_PRODUCTION_URL` fallback; use it everywhere. Ask the user to confirm `NEXT_PUBLIC_SITE_URL` in Vercel production.
8. Checklist for the user (in the session's final message): Supabase production custom SMTP, sender domain, email templates, Google provider on/off.

Acceptance: guest with a full cart → sent request on a phone with no app switch (code typed or pasted), counted taps ≤ 7; the same flow with the link opened in another browser restores the cart; Vitest for the team-number rules and the pending-cart encoding.

Prompt:
```
Read CLAUDE.md and docs/IMPROVEMENT-PLAN.md (Rules, S2). Plan first: how the email code, the server-side pending cart and the single sign-up path fit Supabase Auth with @supabase/ssr in this repo, and which steps need the user in the Supabase dashboard. After my OK, implement S2 tasks 1–7 and give me the task 8 checklist. Test the full first-time flow against the local stack (Mailpit at http://127.0.0.1:54424) and report the tap count.
```

## S3. Notifications, email first (Plan first)

**Goal:** nobody has to poll. Teams hear at every stage; the admin hears about every request and decision.

Findings: nothing in `src` sends email, WhatsApp or push except Supabase auth emails. `sendQuoteRequest`, `decideQuote`, `approveQuoteByLink`, `setUpTeam`, `sendQuote` (`src/app/admin/orders/actions.ts:30-98`), `recordOrdered`, `receiveShipment`, `createDelivery`, `confirmDelivery` write rows only. The quote editor says "ההצעה נשלחה לקבוצה" (`quote-editor.tsx:51`) although nothing is sent until the admin taps WhatsApp per team member.

Tasks:
1. `src/lib/notify.ts` with Resend (planned in PLAN.md §2): `notify(event, payload)` called with `after()` once each transaction commits. Templates as small React email components in Hebrew, RTL, with the brand header, part names in LTR spans, and a single button.
2. Events and recipients:
   - Request received: every email on the team account (copy of the lines, quote ETA, link) and admin (team, total, link to the admin order).
   - New team signed up: admin.
   - Quote ready: every team email, each with its own signed `/q/<token>` approve link (S0).
   - Quote approved / change requested / rejected: admin.
   - Ordered from suppliers, arrived in Israel, ready for pickup or out for delivery, delivered: team emails that haven't opted out, from `orderStage()`.
   - Quote waiting more than 3 days: one reminder to the team.
   - Daily admin digest: anything waiting longer than N hours (from the S10 queues).
3. Per-user preferences on `/team`: email on/off per stage group; optional WhatsApp number for later.
4. Fix the quote editor success copy to say what was actually sent.
5. Log every send in `audit_log` (event, recipient, provider id) so the admin can see it on the order.
6. Optional, after email works: a Telegram bot or WhatsApp Cloud API for the admin's new-request alert (user decision).

Acceptance: running the full local flow sends the expected emails to Mailpit (or Resend's test mode) with correct Hebrew, RTL and links; failures to send never fail the action; unit tests for the event → recipients mapping in `src/domain/notifications.ts`.

Prompt:
```
Read CLAUDE.md and docs/IMPROVEMENT-PLAN.md (Rules, S3). Plan first: the event list, recipients, template structure, how sends run after the transaction (after()), env vars, and what I need to set up (Resend account, domain DNS). After my OK, implement S3 tasks 1–5. Put the event-to-recipient mapping in src/domain with tests. Show me a screenshot of each email rendered.
```

## S4. Trust: footer, info pages, home sections, price explanation

**Goal:** a team that has never heard of COTS-IL knows within 10 seconds who sells, what the price includes, how long it takes and how to reach a person, and can find it again from any page.

Findings: no `<footer>` (`src/app/layout.tsx:39-42`); `/how-it-works`, `/faq`, `/contact`, `/robots.txt`, `/sitemap.xml` all 404 on production. The home page ends after the supplier pills (whose names truncate to "Th…", "CT…" at 800px). The price basis (USD × 1.6) is never explained; teams comparing with AndyMark's USD price will read it as a 60% markup. Nothing says "adding to the cart and sending a request costs nothing". The "התקנת אפליקציה" button sits above the fold and competes with search. The example chip "REV Spark MAX" lands on an AndyMark "Ships from Sydney" listing (REV isn't a supplier).

Tasks:
1. `src/lib/business.ts`: legal name, VAT/company number, email, phone, WhatsApp, pickup address and hours, handling fee, lead time per supplier (`{ wcp: { minDays, maxDays } … }`), quote turnaround, return policy summary, what the ₪ price includes. Every value `null` until the user fills it.
2. `SiteFooter` in the layout: how it works, FAQ, shipping and lead times, returns, terms, privacy, contact (email + WhatsApp), business name and number. On `/catalog` (infinite scroll) add a "load more" button after 3 pages so the footer is reachable.
3. Info routes, Hebrew, static: `/how-it-works` (4 steps with the order flow and who does what), `/faq`, `/shipping` (lead times per supplier, pickup, delivery), `/returns`, `/terms`, `/privacy`, `/contact`, `/about`. Each with metadata. Write real copy from what the app does today; mark business facts TODO.
4. Home page: under the hero, a one-line value strip ("מחיר בש״ח כולל משלוח מארה״ב, מכס ומע״מ" when confirmed; "הצעת מחיר בלי התחייבות"; "איסוף או משלוח בישראל"); "How it works" in 4 steps; trust strip with "prices updated <last sync date>", supplier logos (real logos, not `.btn-brand` monograms) and typical lead time; "Why order through COTS-IL instead of directly" (one order for all suppliers, ₪ and VAT invoice for the school, consolidated shipping, no customs paperwork, local returns). Move "Install the app" below the categories. Replace the "REV Spark MAX" chip with a part the catalog sells well.
5. Point-of-decision microcopy: under the product page Add button and in the cart footer, "הוספה לסל ושליחת בקשה לא מחייבות תשלום. תקבלו הצעת מחיר לאישור" and a "מה כלול במחיר" disclosure linking to `/shipping`.
6. Floating "שאלה? וואטסאפ" link in the footer and on cart, quote and order pages (hidden if no number).
7. Site-wide OG image (`src/app/opengraph-image.tsx`) for WhatsApp shares of the home page, catalog and shared carts.

Acceptance: every footer link resolves; a 360px check of every new page; no TODO text visible in production when a value is null; Lighthouse SEO ≥ 95 on home.

Prompt:
```
Read CLAUDE.md and docs/IMPROVEMENT-PLAN.md (Rules, S4). Implement S4 tasks 1–7. Ask me for the business facts at the start in one message; whatever I don't know yet stays null in src/lib/business.ts and the UI hides it. Write the info pages in clear Hebrew from how the app actually works (read src/domain/order-stage.ts, src/app/cart/actions.ts, docs/admin-guide.md). Screenshots of home, footer and each page at 360px and 1280px.
```

## S5. Search that finds things (Plan first)

**Goal:** whatever a team types (Hebrew, English, plural, typo, any SKU format) finds the part in under 150 ms, and a SKU lands on that exact variant with "+" ready.

Findings (live tests on production, Nov 10): "מיסב", "מנוע", "גלגל שיניים", "ספארק" → 0 results; "krakn x60" → 0; "am-5400" → 0; "battery" → three separate "Battery Beak" families, no battery; "kraken" → "Kraken Wire Bundle" above the Kraken X60; `/api/search` 450–500 ms per keystroke and 1.6 s for "wcp-0749", `Cache-Control: max-age=0`. In code: `searchPatterns` ANDs ILIKE substrings (`src/lib/catalog-filters.ts:106-113`); `search_text` holds English titles, supplier, SKUs and options only (`src/suppliers/families.ts:194-201`); `quickSearch` returns a variant only for single-part families (`src/lib/catalog.ts:504-539`) and the route links to the family without `?v=` (`src/app/api/search/route.ts:43`). Enter adds the first result or opens the catalog depending on network timing (`search-panel.tsx:134-144`). "Kraken X60" parses as qty 60 on the client before the server corrects it (`quick-query.ts:20`). Results empty on each keystroke (`search-panel.tsx:46-47`).

Tasks:
1. Index text: add the Hebrew category name and a Hebrew→English synonym map (`src/domain/search-synonyms.ts`: מנוע→motor, בקר→controller, מיסב→bearing, גלגל שיניים→gear, רצועה→belt, גלגלת→pulley, שרשרת→chain, ציר→shaft, גלגל→wheel, סוללה→battery, חיישן→sensor, בורג→screw, אום→nut, פרופיל→tube/extrusion, פניאומטיקה→pneumatic…) expanded at query time. Add `sku_norm` (letters and digits only, lowercase) for every variant SKU.
2. Matching: strip plural `s`/`es` on terms of 4+ letters; normalise SKUs ("wcp0749", "WCP 0749", "wcp-0749"); when the strict query returns < 3 hits, fall back to trigram `word_similarity` on the existing GIN index.
3. Ranking: exact SKU → main items (not accessories, wire bundles, hardware kits) → in stock → title similarity → popularity (count of order lines, once orders exist). Tests with 30 real queries and their expected first result.
4. SKU → variant: `quickSearch` returns `matchedVariant` (id, sku, price) for an exact SKU in any family; the result shows "+" and links to `familyHref(slug, sku)`; `searchCards` passes the matched variant as the card preset.
5. Merge duplicate families across suppliers and hide regional duplicates: AndyMark "Ships from Sydney - …" products are hidden at sync (`src/suppliers/classify.ts`) or merged into their US family; investigate why "Battery Beak" exists three times and fix the grouping rule in `src/domain/families`.
6. Speed: `/api/search` and `/api/catalog` return `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` (data changes only at sync, which revalidates); normalise the cache key (trim, lowercase, collapse spaces); target p95 < 150 ms warm.
7. Panel behaviour: keep the previous results dimmed while loading; Enter opens the highlighted result only after results settle and the user has moved the highlight, otherwise "all results"; use the server's parsed `q`/`qty`; empty state shows recent searches (localStorage), the example chips and the categories; prefill the panel with `?q` on `/catalog`; show "⌘K" on Mac in the header too; inline option chips for multi-option results (reuse the family picker) so a gear can be added from search.
8. Zero results: suggestions ("did you mean …" from trigram), the categories, and "לא מצאתם? שלחו לנו קישור לחלק" (a request with a URL and a note, sent to the admin; this is a single-part request form, not the removed SKU-list paste; confirm with the user before building it).

Acceptance: the 30-query table passes in Vitest (domain-level ranking and normalisation) and on the preview; Hebrew queries return the right category; "wcp-0749" opens the exact gear with its options selected; search p95 measured and reported.

Prompt:
```
Read CLAUDE.md and docs/IMPROVEMENT-PLAN.md (Rules, S5). Plan first: the index changes (migration for sku_norm and search text), the query shape, the ranking, and how the cache key is normalised; include EXPLAIN ANALYZE for 5 queries on the local DB. After my OK, implement S5 tasks 1–7 and ask me about task 8 before building it. Report the 30-query table before and after, and p95 latency.
```

## S6. Catalog listing fixes

**Goal:** filtering and adding from the grid works first time on a phone, with the 2-click budget for parts with options.

Findings:
- `key={catalogQuery(...)}` on `CatalogBrowser` (`src/app/catalog/page.tsx:52`) remounts it on every filter change: the "More filters" `<dialog>` and mobile facet popovers close after each tap; the sidebar scroll resets.
- "+" on a card whose variant is already settled by filters opens a picker where tapping a chip deselects it (`family-card.tsx:89-92`, `pick.ts:73-76`).
- Spec filters match per family, not per variant (`hasSpec`, `src/lib/catalog.ts:30-36`); facet lists ignore other selected filters (`getSpecFacets`, `:252`); counts are fetched but not shown.
- Mobile: the in-card picker is a see-through overlay over a ~126px card and closed itself during the walkthrough; list view overflows at 360px (`family-card.tsx:170-191`); the in-cart stepper overlaps the price at 360–390px.
- Default sort is alphabetical-ish (a ₪600 bevel bundle leads "Gears"); the page h1 and title are always "קטלוג" (`catalog/page.tsx:10,66`).
- First-row images are `loading="lazy"`; no `srcSet`; `sized()` duplicated in 5 files.
- `toCards` ships every variant (up to 200 per card) to the client for every card, again on every add, and up to 480 cards on Back (`catalog.ts:150-210`, `catalog/page.tsx:40`).
- Infinite scroll has no error handling and can retry in a loop (`catalog-browser.tsx:190-213`); filter changes use `replace`, so Back leaves the catalog.
- About 300px of controls before the first product on mobile; the header has no link to the catalog.

Tasks:
1. Drop the `key`; reset `cards`/`pages` in an effect keyed on the filter string. Popovers allow several values before closing; the sheet's "Show N products" works.
2. `onPlus`: add directly when `singlePart || picked.chosen`.
3. Variant-level spec filtering (one EXISTS over `variant_id` with `HAVING count(DISTINCT key) = n`); disjunctive facet counts; show counts and disable zero values.
4. Mobile picker as a bottom sheet (photo, chips with price per value, quantity, Add); desktop keeps the overlay. Price shown on each chip or under the picker once settled.
5. 360px: list view stacks price under title, action `w-auto`; in-cart stepper gets its own row on narrow cards; stepper buttons 44px.
6. Sorting: default "מומלץ" = main items first, in stock, then popularity/price; offer price ↑/↓ and newest. Card titles show the distinguishing option (bore, DP) when truncated.
7. `generateMetadata` and h1 from the category or `חיפוש: <q>`; canonical `?category=` only; `noindex` for `q`, spec filters and sort. Breadcrumb back to the filtered list.
8. Images: one `shopifyImage(src, w)` + `srcSet` (300/600/900) helper in `src/lib/catalog-links.ts`; first 4–6 cards eager with `fetchPriority="high"`.
9. Payload: cards carry `optionKeys`, `minPrice`, `onlyVariant` and a compact option matrix; full variants load on first "+" from a cached `/api/family/[id]/variants`. Cap SSR at 2 pages and restore deeper scroll by fetching.
10. Infinite scroll: `res.ok` check, back-off, "נסו שוב" button; `push` for facet changes and scroll to the top of results.
11. Compact mobile header area: count + view toggle in the facet row; VAT note moves to the footer. Header gets a "קטלוג" link from `sm` up and in the account menu on mobile.
12. Empty state with suggestions, categories, and (if built in S5) the "send us a link" request.

Acceptance: click counts reported for (a) single part from grid: 1, (b) gear with teeth + bore from the grid: ≤ 3 on a phone; list view and grid at 360px without horizontal scroll; payload size of `/catalog?category=gears` before/after.

Prompt:
```
Read CLAUDE.md and docs/IMPROVEMENT-PLAN.md (Rules, S6). Implement S6 tasks 1–12, committing after each pair. Spec-filter and facet logic changes go in src/domain/facets.ts or src/lib/catalog.ts with tests. Report the click counts, the HTML/RSC payload size of /catalog?category=gears before and after, and screenshots at 360px (grid, list, picker sheet, filters sheet) and 1280px.
```

## S7. Product page

**Goal:** everything needed to decide is beside the Add button; the description is ours, not the supplier's sales page.

Findings (live and code):
- Supplier descriptions are shown raw in English, including the supplier's promotions ("Buy 10 or more Kraken motors… $50 off CANivores"), US list prices ("MSRP: $399.99. FRC Educational Discount: $217.99") and "contact sales@ctr-electronics.com". This invites a price comparison and sends teams to the supplier.
- Doc link labels show `&amp;`; "לעמוד המוצר באתרCTR Electronics" is missing a space.
- No lead time or "what happens if out of stock" near Add (`family-view.tsx:142-149, 283-288`); a part with no price says it will be checked in the quote but Add is disabled (`:118, :145`).
- Quantity is +/− only. The disabled mobile "בחרו שיניים" button doesn't take you to the missing option (`:148, :316`). Option groups scroll inside their own boxes on mobile (scroll within scroll).
- Specs are family-wide, not for the chosen variant (`page.tsx:52-61`); companions don't follow the chosen variant and exist only for gears, belts, wheels, bearings and shafts (`src/domain/families/companions.ts`); the heading "בדרך כלל מוזמן יחד עם" claims order data that doesn't exist.
- "All options" table rows only link (full navigation); gallery has no swipe or zoom; main image lacks `fetchPriority`; Add uses `bg-brand`, not `.btn-brand`.
- No JSON-LD.
- An option group labelled "מרחק צירים" lists tooth counts (12t, 14t…), which reads as a parsing error.

Tasks:
1. Description cleaning in `src/lib/description.ts` (tests with the Kraken X60, a WCP gear and a Thrifty Bot page): drop paragraphs with `$` amounts, MSRP, discounts, "special offer", "contact … @", "add to cart", "checkout"; decode entities in doc labels; collapse spec tables into the spec section. Long descriptions collapse behind "קראו עוד".
2. Decision box under the price: "מגיע לישראל תוך כ-N שבועות" from `business.ts` per supplier; out of stock: "לא זמין כרגע אצל הספק, נבדוק עבורכם בהצעה" and still addable; no price: addable as a quote-only line (ask the user) or "לא ניתן להזמין כרגע, דברו איתנו".
3. Typed quantity (shared `QtyStepper` from S1); the mobile buy bar button reads "בחרו <option>" and scrolls to and highlights the first missing group.
4. Option groups never scroll internally; long groups wrap, with values sorted numerically and the price difference per value when it varies.
5. Specs of the chosen variant; companions follow the chosen variant, cover motors (mounts, encoders, wires), swerve (wheels, gears), electronics (wires, connectors) and are labelled "מתאים לשימוש עם" with "+" on each and "הוספת הכל".
6. "All options" table: typed quantity and Add per row (McMaster-style), sortable by option.
7. Gallery: swipe on touch, click/tap to zoom, `fetchPriority="high"` on the main image.
8. Fix the "מרחק צירים" grouping (check `src/domain/families/parse.ts` for which option this is) and the missing spaces.
9. JSON-LD `Product` + `Offer` (ILS, availability, SKU, brand) and `BreadcrumbList`.

Acceptance: the three test pages show no supplier promos, USD prices or supplier contacts; click count for a gear with two options from the page: ≤ 3 on a phone; Rich Results test passes on one product.

Prompt:
```
Read CLAUDE.md and docs/IMPROVEMENT-PLAN.md (Rules, S7). Implement S7 tasks 1–9. Description cleaning is pure logic with Vitest tests built from three real supplier descriptions (fetch them from the local DB). Ask me about quote-only lines (task 2) before building them. Screenshots of the Kraken X60 and Steel Spur Gear (20 DP) pages at 360px and 1280px.
```

## S8. Quote, approval, tracking and team (Plan first)

**Goal:** approving is safe and informed, changes don't kill orders, and a team always knows where its parts are.

Findings:
- `/q/<token>` shows title, SKU, quantity and line total only (`src/app/q/[token]/page.tsx:44-53`): no requested-vs-quoted diff or change reasons, though `/orders/[id]` has them (`components/orders.tsx:137-163`). Removed lines show as "×0 ₪0".
- Expired links are dead ends; the 14-day expiry is never shown.
- "סיבה או שינוי מבוקש" sits beside "דחיית ההצעה", which sets the order to rejected (`orders/actions.ts:62-63`).
- Approve and reject are one tap with no undo. No quote PDF with the business's details, payment terms or validity for school procurement.
- Timeline has no dates (`order-timeline.tsx:17-37`); the header badge uses stored status while the timeline uses the derived stage; "allocated" folds into "בדרך" (`order-stage.ts:29`), so there's no "ready for pickup".
- Cancel is one tap with no Undo and no feedback (`orders/[id]/page.tsx:137-142`).
- `/orders` doesn't highlight "waiting for your approval"; Order again re-adds requested quantities including removed lines (`cart/actions.ts:227`).
- Team account page (after S0): adding an email shows a link without copy or WhatsApp (`team/invite-form.tsx`), `h-9` buttons, instant removal without Undo.

Tasks:
1. One quote view component used by `/q/<token>` and `/orders/[id]`: changes block ("שינויים מהבקשה") with reasons, removed lines, totals breakdown, validity date, expiry shown on the link page; an expired link offers "בקשו קישור חדש" (notifies admin) and a link to the order.
2. Three decisions: approve, request a change (keeps the order open, notifies admin, new `change_requested` decision recorded in `quote_approvals` or audit log, no status change), reject. Undo window of 30 s after approve or reject (soft decision finalised by `after()` or reversible until the admin orders).
3. Quote PDF (print stylesheet or a route that renders a printable page) with business name and number, quote number and version, validity, payment terms, lines, VAT breakdown.
4. Tracking: stage everywhere (drop the stored-status badge for teams); dated timeline from audit log and purchasing records; ETA per supplier; new "מוכן לאיסוף" stage from allocations; pickup address and hours from `business.ts`.
5. Cancel: inline Undo window and a clear "ההזמנה בוטלה" state.
6. `/orders`: "ממתין לאישורך" section first; estimate vs quote label on totals; Order again uses the last approved quote's quantities and skips removed lines; on home, when the cart is empty, "הזמנה חוזרת" sends in 1 tap (with Undo).
7. Team account page: adding an email sends it automatically (S3) and offers Copy and WhatsApp share; remove with Undo; save gives feedback; 44px controls.

Acceptance: every decision path tested on the local stack; tap counts: approve from link 2 (open + approve), order again 1; Vitest for the change-diff and stage-with-dates logic.

Prompt:
```
Read CLAUDE.md and docs/IMPROVEMENT-PLAN.md (Rules, S8). Plan first: the shared quote view, how "request a change" and the undo window are stored without breaking D3/D4 in docs/REDESIGN-AUDIT.md, and the dated timeline's data sources. After my OK, implement S8 tasks 1–7. Screenshots of /q/<token> (with changes, expired), /orders/[id] at each stage, /orders and /team at 360px.
```

## S9. Performance, reliability, SEO and observability

**Goal:** pages are fast and measured, failures are visible to us and readable for teams, and search engines and WhatsApp see every page properly.

Findings:
- `postgres(url, { prepare: false })` with no pool size, idle or connect timeout, and no statement timeout (`src/db/index.ts:13`); consistent with the Nov 9 requests hanging for 300 s.
- `getViewer` (Auth network call + 2 queries) isn't wrapped in `cache()` and runs 2–3 times per request (`src/lib/auth.ts:26-59`).
- Product and catalog pages call `connection()` only to compare the availability date with today, so the whole page is dynamic and the LCP image waits for streaming (`catalog/p/[slug]/page.tsx:96`, `catalog/page.tsx:37`).
- `quickSearch`/`searchCards` cache keys are raw user input (flood risk); `partialPrefetching: true` in `next.config.ts` is unverified for 16.4.4.
- No `sitemap.ts`, `robots.ts`, JSON-LD, default OG image; pages without metadata: home, login, signup, pending, admin; login's tab title is just "COTS-IL".
- No `error.tsx`/`global-error.tsx`: thrown actions show Next's English error page. No Sentry, Speed Insights or analytics. CI doesn't run `next build`; no e2e tests.
- During client navigation the header is part of the view transition and shows doubled for a moment (seen on catalog and product pages).
- No security headers; no rate limiting on `/api/*` or auth actions; the email address goes into the URL (`auth/actions.ts:53`, `invite/actions.ts:41`).
- `TeamNotice` loads all of a team's orders to show the last one (`src/app/page.tsx:34`); Heebo preloads although it's a fallback.

Tasks:
1. DB client: `{ prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 }` and a statement timeout (8 s); `export const maxDuration` lower on catalog routes. Do this first.
2. `cache(getViewer)`; use `getClaims()` for reads, `getUser()` for writes.
3. Static product and catalog shells: move the freshness comparison into a small client `<Availability>` (or a tiny dynamic island) so `getFamily`/`searchCards` pages prerender; check whether `"use cache: remote"` is needed on Vercel for catalog reads (read the docs in node_modules).
4. Normalise and bound cache keys; verify `partialPrefetching`.
5. `sitemap.ts` (home, categories, every family), `robots.ts` (disallow admin, auth, cart, orders, `/api`), default `opengraph-image.tsx`, metadata on every page, `noindex` on auth/admin/orders.
6. Hebrew `error.tsx`, `global-error.tsx`, `admin/error.tsx` with retry and contact; actions use `safeParse` and return `{ error }` instead of throwing.
7. `view-transition-name: site-header` (and the cart pill) so they stay put during navigation.
8. `@vercel/speed-insights` and `@vercel/analytics`; Sentry for server, actions and client errors; a Lighthouse CI job on previews against home, catalog, a product (targets: performance ≥ 90, accessibility ≥ 95, SEO ≥ 95, CLS < 0.1).
9. CI: `next build` with dummy env, `drizzle-kit check`, Playwright smoke (guest cart → sign in → send → admin quote → approve link) against the local stack.
10. Security headers (CSP with a nonce for the install-prompt script, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`); Vercel Firewall rate limits on `/api/*` and auth actions (user sets them in the dashboard; write the rules); move the email out of `/signup/check-email?email=`.
11. Small fixes: `TeamNotice` queries one order; Heebo `preload: false`; index on `sync_jobs (supplier_id, started_at)`.

Acceptance: Lighthouse numbers before and after for three pages; the Playwright smoke test passes in CI; a forced DB stall fails within 10 s with the Hebrew error page.

Prompt:
```
Read CLAUDE.md and docs/IMPROVEMENT-PLAN.md (Rules, S9). Read the caching, connection(), metadata-route and error-handling guides in node_modules/next/dist/docs first. Implement S9 tasks 1–11 in order, one commit each. For anything that needs the Vercel or Supabase dashboard (env vars, firewall, Sentry DSN), write exact steps for me instead of guessing. Report Lighthouse mobile scores before and after.
```

## S10. Admin inbox and notifications (Plan first)

**Goal:** the reseller sees "what needs me now" on one screen and turns a request into a sent quote in under 2 minutes.

Findings: no admin layout or navigation (every page has its own back link; entry only through the account menu); `/admin` shows one count; the orders list has no status tabs, age or search (`src/app/admin/orders/page.tsx`); team approval isn't on the order page; quote lines need a typed reason even when only adopting the synced price (`src/domain/orders.ts:219`); shipping has no default; sale prices (`compareAtUsd`) and weight (`grams`) are stored but never shown; destructive actions (`removePoLine`, `reverseReceipt`, `deleteShipment`, `cancelPo`, `cancelDelivery`, `removeImportCost`) are single taps on `text-xs` links; `ActionForm` has no pending state and many actions throw on bad input; sync errors and counts aren't shown and nobody hears when a part in an open order disappears or changes price; pricing is hard-coded USD × 1.6 and the report FX rate is a URL parameter; `/admin` lists a team once per member email (duplicate React key); English "no supplier SKU" in the Hebrew UI; history scans load every approved line ever (`getDemand`, `getReadyToDeliver`, `getItemProgress`).

Tasks:
1. `src/app/admin/layout.tsx` with a sticky tab bar (Inbox, Orders, Purchasing, Shipments, Deliveries, Reports, Catalog) and badge counts, scrollable at 360px.
2. Inbox (`/admin`): 7 queues with count and oldest age (new requests, quotes waiting for teams > 3 days, approved not on a PO, PO drafts not ordered, ordered without shipment, shipments not received, ready to deliver) plus failed syncs and "open orders affected by the last sync".
3. Orders list: status tabs, oldest first in "new", age badge, search by team or order number.
4. Order page: approve/reject team inline when pending; quote editor with "use catalog price" per line and for all (auto reason), default shipping from settings, live totals, sale and heavy-item flags, sticky Send bar on mobile, 44px inputs.
5. `settings` / `pricing_rules` table and admin form: multiplier by supplier/category, handling fee, default shipping, FX rate with date; `priceIls()` resolves the multiplier (keep `src/domain/pricing.ts` the only price code); migration applied by the user.
6. Purchasing board: waiting time per supplier, $ total, "create all drafts".
7. Every destructive action gets Undo (soft-delete window or re-insert from the audit-log snapshot) and a 44px target; `ActionForm` gets `useFormStatus` pending state and inline errors; all actions `safeParse`.
8. Fix the duplicate-team join, Hebrew "ללא מק״ט ספק", SQL-side filtering for the history scans, suspend/reactivate a team.
9. Order timeline for the admin from `audit_log` (including notifications sent in S3) and internal notes per order.

Acceptance: time a seeded request → sent quote on the local stack (target < 2 minutes, under 10 clicks); every queue has a test with seeded data; no destructive action without Undo.

Prompt:
```
Read CLAUDE.md, docs/admin-guide.md and docs/IMPROVEMENT-PLAN.md (Rules, S10). Plan first: the inbox queries (reuse src/lib/{orders,purchasing,logistics,reports}.ts), the settings/pricing_rules migration, and the undo strategy for destructive admin actions. After my OK, implement S10 tasks 1–9. Update docs/admin-guide.md. Report the click count and time for request → sent quote.
```

## S11. Design system and accessibility pass

**Goal:** one button, one card, one type scale, AA contrast, and 44px everywhere, so every page looks like the home page.

Findings (grep counts from the audit): the shared `Button` is `h-10 rounded-md` flat `bg-brand` and `.btn-brand` is never used on a real primary action (send request, add, approve, 404 search use flat `bg-brand` in about 17 places); two card systems (`rounded-md/lg border bg-surface` ×64 vs `card-surface` ×6); 16 page titles at `text-2xl` instead of `text-title`, 22 `font-bold` instead of 600, 59 arbitrary text sizes (`text-[15px]` ×42; 10 below the 13px caption), `text-sm` ×110 and `text-xs` ×54 mostly in admin; about 25 tap targets under 44px (stepper `size-9`, toast Undo `h-9`, buy-bar cart `h-9`, filter chips `min-h-9`, view toggle `h-9`, team and admin controls); contrast failures: green #1E8E3E and amber #B26A00 at 13px (~4.2:1), toast Undo blue on navy (~2.4:1) and on red (~1.3:1); leftovers of the grey look (`#f5f5f7` ghost, `ring-black/5`, black backdrop, navy selected chips); hard-coded hex gradients in `src/app/page.tsx` and `site-header.tsx`; 3 prices bypass `formatIls` in admin; card images repeat the title in `alt`; no skip link; some focus rings removed (`outline-none` on the search input); the install button flashes in the installed app.

Tasks:
1. `Button` (`h-11 rounded-full`, variants primary = `.btn-brand`, secondary = soft white pill, ghost, danger) and `Card` (`card-surface`); replace all uses. `Input`/`Select` 44px `rounded-xl bg-subtle`.
2. Type scale: add `--text-callout: 15px`; replace arbitrary sizes and `text-2xl`/`font-bold` titles; nothing under 13px.
3. Colour: darken success/warning text tokens (~#177A33, ~#995A00) for captions; brand-blue selected chips; replace grey leftovers; gradient tokens instead of hex in TSX.
4. Targets: every interactive element ≥ 44px (list above); destructive admin links become buttons.
5. A11y: skip link, visible focus rings on every pill, `alt=""` where the title is adjacent, labels and `aria-describedby` for form errors, `role="alert"` on `ActionForm` errors, `aria-live` cart total, `<Ltr>` for "×qty" and dates in lists.
6. Polish: home tagline pill becomes `rounded-2xl` on mobile; supplier pills don't truncate; spec/docs/description blocks use `card-surface`; install button hidden before hydration in standalone mode.

Acceptance: a grep script in `scripts/design-lint.ts` (run in CI) that fails on `text-[1[0-2]px]`, `h-9`/`size-9` on buttons, `font-bold` in headings, hex colours in TSX, and `formatIls` bypasses; axe has no serious issues on home, catalog, product, cart sheet, `/q`, `/orders/[id]`.

Prompt:
```
Read CLAUDE.md and docs/IMPROVEMENT-PLAN.md (Rules, S11). Implement S11 tasks 1–6, then add scripts/design-lint.ts to CI. Before/after screenshots of home, catalog, product, cart sheet, /orders/[id], /team and two admin pages at 360px and 1280px.
```

## S12. Beyond parity: reasons to come back (Plan first)

Ideas that make COTS-IL better than ordering direct, in order of value. Each is its own session after S1–S8; ask the user which to build.

1. **Team lists (BOMs)**: named lists per robot or subsystem ("Swerve 2027"), shareable, "add list to cart", quantities kept. DigiKey's BOM manager and Amazon Lists, scoped to a team. (Not a paste box: lists are built by adding from the catalog.)
2. **Season kits**: admin-curated kits ("Kickoff drivetrain", "FTC starter") on the home page, one tap to add all; a "Season 2027 picks" scroller.
3. **Budget and spend**: season spend per team, by supplier and category, exportable for the school's accounting; optional budget with a warning in the cart.
4. **Back-in-stock and price-drop alerts** on items in a list or cart (uses the daily sync and S3 email).
5. **Group buys**: the admin consolidates teams' orders per supplier (already modelled); show teams "next consolidated WCP order closes on <date>" to set expectations and nudge timing.
6. **Popularity signals**: "ordered by N teams this season" on cards (from order lines, no personal data).
7. **REV and goBILDA** through the CSV import (D7), since FTC teams need them most.

---

## What the user needs to provide

| Needed for | Item |
|---|---|
| S4, S7, S8 | Business legal name and number, email, phone, WhatsApp, pickup address and hours, handling fee, what the ×1.6 price covers, typical lead time per supplier, quote turnaround, return policy, payment terms |
| S2, S3 | Sending domain (DNS access), Resend account and API key, Supabase production custom SMTP and Hebrew templates, Google sign-in on/off |
| S9 | Sentry DSN (or skip), Vercel Firewall rules applied in the dashboard, confirmation that `NEXT_PUBLIC_SITE_URL` is set in production |
| S5 | Whether to build the "send us a link to a part" request (it's a single-part request form, not the removed SKU-list paste) |
| S7 | Whether parts without a price can be requested as quote-only lines |

## Click budget after the plan

| Task | Today | After | Sessions |
|---|---|---|---|
| Known single part, search → in cart | 1–2 | 1 | S5 |
| Known SKU inside a family, search → in cart | 5–6 | 1 | S5 |
| Gear with two options from the grid, phone | 4 | ≤ 3 | S6 |
| Returning team, search → sent | 5 on a phone | 3 (mini cart bar in the search panel) | S1, S5 |
| First-time team, full cart → sent | 10 taps + 2 app switches, breaks across browsers | ≤ 7, no app switch | S2 |
| A second person on the team sends the cart | 7–8 via the WhatsApp handoff, doubles quantities | 2 (open cart, send), same as anyone on the team | S0 |
| Approve from link | 2 | 2 (opening a link must not approve) | S8 |
| Order again | 2 (home) / 4 (orders) | 1 | S8 |

## Progress

| Session | Branch / commit | Done | Notes |
|---|---|---|---|
| S0 | `claude/infallible-ramanujan-54cb97` | ✓ (7a) | Migration `team_role_legacy` must reach production before this merges. 7b after one deploy: drop `memberships.role`, `team_invitations.role` and the `team_role` enum, and stop `handle_new_user()` writing `role` |
| S1 | | | |
| S2 | | | |
| S3 | | | |
| S4 | | | |
| S5 | | | |
| S6 | | | |
| S7 | | | |
| S8 | | | |
| S9 | | | |
| S10 | | | |
| S11 | | | |
| S12 | | | |
