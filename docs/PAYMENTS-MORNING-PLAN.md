# Payments, balances and חשבונית ירוקה (Morning) (plan, Nov 24, 2026)

This replaces I1 in `docs/AUDIT-2026-11-17-PLAN.md`. The goals:
- the admin always knows who paid and who owes;
- every payment gets a legal document from Morning (formerly חשבונית ירוקה) without retyping;
- a team can download its documents and, optionally, pay by card from the site.

It works without Morning too. Phase P1 alone (recording payments by hand) is useful on its own. Morning then removes the double entry.

## Decisions the owner makes first (P0)

| # | Question | Why it matters |
|---|---|---|
| D1 | **עוסק מורשה or עוסק פטור** (or a company)? | A מורשה issues חשבונית מס/קבלה (type 320) with VAT. A פטור issues only קבלה (type 400). Today the site says prices have no VAT. As a מורשה, either the ₪ prices become "before VAT" and the invoice adds 18%, or they become VAT-inclusive and the invoice splits them. This changes the price wording on every page (`markupText`, cart, quote). |
| D2 | **Your Morning plan:** does it include API keys? Webhooks? | Without the API, P2 to P4 are impossible; only P1 is. Without webhooks, card payments can't mark an order paid by themselves (P4 falls back to checking on demand). |
| D3 | **Card payments through Morning** (their payment page or card clearing), yes or no? | If no, payment is by bank transfer or a school cheque, and P4 is skipped. |
| D4 | **Who is the invoice made out to:** the team, its school, or its non-profit? | Schools and non-profits need their own legal name and number on the document. This is per team, so the team fills it in (see "Billing details"). |
| D5 | **When is the document issued:** when payment arrives (receipt, recommended), or on approval (חשבון עסקה, type 300, then a receipt later)? | Many schools need a document before they pay. The proposal: make the type-300 document available on request, not automatically. |

## Phases

### P1: Payments and balances (no Morning needed), size M

- **Schema:** a `payments` table with:
  - `id`, `order_id` (nullable, for a payment on account), `team_id`;
  - `amount_ils`, `paid_at`, `method` (`transfer | card | cheque | cash | other`);
  - `reference` (bank reference or cheque number), `note`;
  - `document_id` (null until P3), `created_by`, `created_at`;
  - a soft `voided_at` with `void_reason`. A payment is never deleted, because it has accounting meaning.
- **Order money state:** derived in `src/domain/payments.ts`, never stored:
  - `owed` = the approved quote total (plus shipping lines);
  - `paid` = the sum of the payments that aren't voided;
  - state = `unpaid | partial | paid | overpaid`.
- **Team balance and ageing:** derived in the same module. Buckets: 0–30, 31–60 and 60+ days since approval. Tests for every case.
- **Admin:**
  - the order card gets a "תשלום" section with the state tag, the paid and left amounts, a "רישום תשלום" sheet (amount defaults to what's left) and the payment list with a void option;
  - `/admin` gets an "unpaid" filter and a column;
  - `/admin/teams/[id]` gets the balance, ageing and payment history;
  - a new "יתרות" view: every team that owes, oldest first.
- **Team:**
  - "שולם", "שולם חלקית (₪X נותרו)" or "ממתין לתשלום" on `/orders` and `/orders/[id]`;
  - the payment terms from the business facts shown under the total.
- **Export:** payments CSV (date, team, order, amount, method, reference, document number) for the bookkeeper.
- **Audit:** every record or void writes an `audit_log` row.
- **Order delete (Nov 17):** if an order has payments that aren't voided, the confirm says so, and deleting is blocked until they are voided. Once P3 exists, it is also blocked when an issued document exists; see "Credit notes".

### P2: Connecting Morning, size S–M

- **Keys:**
  - `MORNING_API_ID` and `MORNING_API_SECRET` as Vercel environment variables;
  - `MORNING_ENV` set to `sandbox | production`;
  - never in the DB and never sent to the browser.
- **Development:** the sandbox account is used for all development and for the e2e test.
- **`src/lib/morning.ts`:** a thin client.
  - Gets and caches the token; it expires, so refresh it on 401. Check in the current docs whether the account uses the API-key JWT flow or the newer OAuth one.
  - Sets a timeout, retries 5xx and network errors with backoff (like `src/suppliers/stock.ts`), and logs to `job_runs`.
- **`src/domain/morning.ts` (pure, with tests):** maps an order and a payment to a document payload:
  - the client (from the billing details), the lines (the quote lines in Hebrew plus SKU, quantity and ₪ price, then shipping), the VAT mode from D1 and the rounding;
  - the payment block (method, date, reference);
  - `remarks` with the order number, so a document is always traceable to its order.
- **Admin settings:** a new "חשבונית ירוקה" card under `/admin/settings` (the system page) showing:
  - connected / not connected, test or live, and the business name as Morning returns it;
  - the default document type (from D1/D5);
  - whether Morning or the site emails the document (Morning by default);
  - a "בדיקת חיבור" button;
  - a health-list entry (M1): red when the last call failed or the token is rejected.
- **Billing details per team:** new fields on `teams`, editable on `/team` ("פרטי חיוב") and by the admin:
  - `billing_name`, `billing_tax_id` (ח.פ., עמותה or school number), `billing_email` and `billing_address`;
  - `morning_client_id`, filled on the first document.
  - When they're empty, the team name, contact email and address are used.

### P3: Documents, size M

- **Schema:** a `billing_documents` table with:
  - `id`, `order_id`, `team_id`, `payment_id` (nullable);
  - `kind` (`invoice_receipt | receipt | proforma | credit`), `morning_id`, `number`;
  - `issued_at`, `amount_ils`, `pdf_url_he`, `pdf_url_en`;
  - `status` (`pending | issued | failed`), `error`, `created_by`.
- **Issuing:**
  - On "רישום תשלום", a ticked-by-default box "הפקת חשבונית מס/קבלה בחשבונית ירוקה" issues the document in the same action.
  - On the order card: "הפקת מסמך" for a payment that has none, and "חשבון עסקה" on an approved order (D5).
- **Exactly once:**
  - The `billing_documents` row (`pending`) is written before the call. The call sends the row id as the external reference.
  - A retry first looks the reference up in Morning, so a timeout never issues a second document.
  - A failure leaves the row `failed` with the error and a "ניסיון חוזר" button.
- **Team:**
  - a "מסמכים" box on `/orders/[id]` (and on `/q/[token]` once there is one), each document with its number, date, amount and a PDF download (Hebrew, English if asked);
  - the email with the PDF comes from Morning (or from our Resend, by the setting).
- **Credit notes (חשבונית זיכוי):**
  - An issued tax document can never be deleted or edited.
  - Cancelling, refunding or reducing a paid order offers "הפקת זיכוי" for the difference (type 330, linked to the original).
  - Order delete stays blocked while any issued document has no matching credit note.

### P4: Card payment from the site (only if D3 is yes), size M

- **Payment button:** "לתשלום בכרטיס" on `/orders/[id]` and on the approved quote page. It asks Morning for a payment page for the amount left, with the order and payment row as its reference, and sends the team there. The click budget allows that one navigation, since paying is leaving the cart flow anyway.
- **Return page:** `/orders/[id]?paid=1` says "התשלום התקבל, המסמך יישלח במייל" or "התשלום לא הושלם".
- **Webhook:** `POST /api/morning/webhook`.
  - It checks the shared secret and source, and treats each event id once (idempotency).
  - On a successful payment or a created document, it records the payment and links the document Morning issued itself, so no second document.
  - The order turns paid, and the team and the admin get an email.
- **Without webhooks (D2):** the return page and a "בדיקת סטטוס" admin button ask Morning for the payment by reference instead.

### P5: Reports and follow-up, size S

- **Profit report:** money in by month, from the payments, next to sales by approval.
- **Ageing report:** with a reminder email to teams 14 and 30 days after approval (once Resend is on), and an admin digest line ("3 קבוצות חייבות ₪X").
- **Optional:** supplier orders sent to Morning as expenses (US vendor invoices as attachments), so the bookkeeper sees both sides.

## Order and size

P0 decisions, then P1 (useful alone), then P2 and P3 together in one session (they need the Morning sandbox and D1), then P4 only if D3 is yes, then P5. Roughly 3–4 build sessions.

## Rules carried over

- Writes only through server actions with `requireAdmin` or `requireActiveViewer`.
- Payments and documents are append-only: a mistake is voided or credited, never deleted.
- Amounts come from `src/domain/pricing.ts` and the quote snapshot, never recomputed from today's catalog.
- Hebrew, RTL, 44px targets, and `formatIls` for every ₪.
- Morning is optional at run time: with no keys set, P1 works and the Morning buttons are hidden, not broken.
