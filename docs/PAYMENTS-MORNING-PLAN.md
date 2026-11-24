# Payments, balances and חשבונית ירוקה (Morning) (plan, Nov 24, 2026)

This replaces I1 in `docs/AUDIT-2026-11-17-PLAN.md`. The goals:
- the admin always knows who paid and who owes;
- every payment gets a legal document from Morning (formerly חשבונית ירוקה) without retyping;
- a team can download its documents and, optionally, pay by card from the site.

It works without Morning too. Phase P1 alone (recording payments by hand) is useful on its own. Morning then removes the double entry.

## Decided (Nov 24, 2026)

- **D1, VAT:** the business is an **עוסק מורשה**. Option A: **site prices include VAT (18%)**.
  - Every ₪ price on the site is the final price, worded "כולל מע״מ".
  - Quotes, orders and Morning documents split it out: net = gross ÷ 1.18, with a "מע״מ 18%" line. This matches how the admin already quotes in Morning (quote 434: ₪15,800 total).
  - The VAT rate is a setting (`pricing.vatRate`, 0.18), so a future rate change is one edit.
  - Old order items keep their own snapshot.
  - The multiplier is now VAT-inclusive. Keeping the old margin means about 1.6 × 1.18 ≈ 1.89. That is the admin's choice in `/admin/settings/pricing`; no code sets it.
  - The CLAUDE.md rule "never say a price includes VAT" is replaced by this.
- **D2, Morning plan:** "כלים למפתחים" exists in the account, so the API is available. Webhooks are not needed without card payments.
- **D3, card payments:** **no** for now. Morning's card payments cost ₪29 a month plus per-payment fees. Teams pay by bank transfer or school payment, and the admin records it. **P4 is skipped**; it can be added later unchanged.
- **D4, clients:** the admin already has the teams as Morning clients (סטימפאנק רעננה, צעירים בירוחם, DRC דבורה, …). Each team is linked once to its existing client: a suggested match by name, and the admin confirms. A new team gets a new client.
- **D5, documents:** the site follows today's manual flow.

  | Event on the site | Morning document |
  |---|---|
  | Quote sent | הצעת מחיר (type 10) |
  | Quote approved | חשבון עסקה (type 300) |
  | Payment recorded | חשבונית מס/קבלה (type 320), linked to the 300 so it closes |
  | Refund or cancellation after an invoice | חשבונית זיכוי (type 330) |

  Each step can be turned off in the Morning settings card.

## Decisions the owner makes first (P0), the original questions

| # | Question | Why it matters |
|---|---|---|
| D1 | **עוסק מורשה or עוסק פטור** (or a company)? | A מורשה issues חשבונית מס/קבלה (type 320) with VAT. A פטור issues only קבלה (type 400). Today the site says prices have no VAT. As a מורשה, either the ₪ prices become "before VAT" and the invoice adds 18%, or they become VAT-inclusive and the invoice splits them. This changes the price wording on every page (`markupText`, cart, quote). |
| D2 | **Your Morning plan:** does it include API keys? Webhooks? | Without the API, P2 to P4 are impossible; only P1 is. Without webhooks, card payments can't mark an order paid by themselves (P4 falls back to checking on demand). |
| D3 | **Card payments through Morning** (their payment page or card clearing), yes or no? | If no, payment is by bank transfer or a school cheque, and P4 is skipped. |
| D4 | **Who is the invoice made out to:** the team, its school, or its non-profit? | Schools and non-profits need their own legal name and number on the document. This is per team, so the team fills it in (see "Billing details"). |
| D5 | **When is the document issued:** when payment arrives (receipt, recommended), or on approval (חשבון עסקה, type 300, then a receipt later)? | Many schools need a document before they pay. The proposal: make the type-300 document available on request, not automatically. |

## Phases

### P1: Payments and balances (no Morning needed), size M

**Done (Nov 24, 2026).** Built as below, plus: owed is the latest quote version the team approved (a re-quote doesn't change it until approved again); `payments` is guarded by a trigger (no delete, no edit except voiding); a payment follows its order when the order moves or the team is merged; a team with payments isn't deleted; each quote snapshots the VAT rate (`quotes.vat_rate`). The bookkeeper's CSV is on `/admin/balances`.

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

### P2 and P3: built (Nov 24, 2026)

Built against the Morning **sandbox**. Production has no Morning keys: the owner's Basic plan refuses API keys ("Product is not included in your subscription"), so every Morning control stays hidden there and nothing changes until the keys are added.

What exists:
- **Config** (`morningSetup` in `src/domain/morning.ts`): `MORNING_API_ID`, `MORNING_API_SECRET`, `MORNING_ENV` (`sandbox` | `production`). No keys at all means off: no card, no health row, no buttons, no billing form. Half a setup is "invalid" (a red health row, the card says what is missing).
- **Client** (`src/lib/morning.ts`): a token cached per process and fetched again on a 401, 15 s timeouts, reads retried on 5xx/429/network with backoff (0.5 s, 1.5 s), `job_runs` rows under job `morning` for each issue and connection test.
- **Payloads** (`src/domain/morning.ts`, tested): built from the quote snapshot (lines with quantity, then shipping) or the payment as recorded; every income row is `vatType: 1` (the price includes VAT, D1), the document `vatType: 0`.
- **`billing_documents`** (migration `20261124145811_morning_documents`): pending row first, its reference (`BH-` + 12 hex of the row id) in `remarks`; a retry or a timeout looks the reference up with `POST /documents/search` before sending again; a claim (`attempt_at`, 2 minutes) keeps two attempts apart. A trigger refuses deleting a pending or issued row and editing an issued one (its order and quote may go null when an order is deleted; its team follows a team merge). Unique: one הצעת מחיר and one חשבון עסקה per quote version, one חשבונית מס/קבלה per payment.
- **Steps** (`settings.morning`, each on by default, switched on the system page's "חשבונית ירוקה" card):
  - quote sent (`sendQuote`, and a replaced part's new version) → הצעת מחיר (10), after the response;
  - quote approved → חשבון עסקה (300), once the team's 30-second undo window closes and the approval stands;
  - "רישום תשלום" with the box "הפקת חשבונית מס/קבלה בחשבונית ירוקה" (ticked) → 320 in the same action, linked to the order's 300 (repeats its lines when the payment is the whole deal, else one line "תשלום עבור הזמנה N"); a cheque asks for bank, branch and account (Morning refuses a cheque without them); "אחר" has no Morning type and is left to the admin;
  - "הפקת זיכוי" on an issued 320 → 330 for all or part of what is left, with a reason; `linkType: "cancel"` when it credits the whole document.
- **Numbers on both paths:** an issued document fills `quotes.morning_quote_no` / `morning_deal_no` and `payments.morning_doc_no` (+ `document_id`) when they are empty. A number typed by hand means the step is skipped (it was issued in Morning already).
- **Order card:** "מסמכים" with each document, its PDF, "ניסיון חוזר" on a failed or stuck one, "הפקת זיכוי", and "הפקת הצעת מחיר" / "הפקת חשבון עסקה" when a step was off or failed; "הפקת חשבונית מס/קבלה" on a payment without one.
- **Guards:** an order isn't deleted while a document is pending or a 320 has no full credit note (`deleteBlockedByDocuments`); an order with documents doesn't move to another team.
- **Teams:** `billing_name`, `billing_tax_id`, `billing_email`, `billing_address`, `morning_client_id`. "פרטי חיוב" on `/team` and on the admin's team page (shown only while Morning is on). Linking (D4): the team page lists Morning clients that may be the team (same tax id, same email, or a name sharing most words: `clientSuggestions`) with "קישור", or "יצירת לקוח חדש". A document for an unlinked team creates a client only when Morning has no similar one; otherwise it fails with "מקשרים את הקבוצה ללקוח בדף הקבוצה, ואז ״ניסיון חוזר״".
- **Team:** `/orders/<id>` lists the issued documents with "PDF" (and "English" when there is one) through `/orders/<id>/documents/<docId>`, which checks the viewer is on the team and asks Morning for a fresh link.
- **Health:** a "חשבונית ירוקה" row (red: half a setup or the last call failed; yellow: never tested; ok), only while there are keys.

Confirmed on the sandbox (Nov 24, 2026; Morning's OpenAPI file is at `https://developers.morning.co/docs/openapi.bundled.json`):
- **Token:** `POST https://api.sandbox.morning.dev/idp/v1/oauth/token` (sandbox; `api.sandbox.d.greeninvoice.co.il/idp/v1/oauth/token` answers too) and `https://api.morning.co/idp/v1/oauth/token` (production, per the OpenAPI file; it answers `invalid_client` without keys). JSON `{grant_type: "client_credentials", client_id, client_secret}`; the reply has `accessToken`/`access_token` and `expires_in` 3600.
- **API base:** `https://sandbox.d.greeninvoice.co.il/api/v1` and `https://api.greeninvoice.co.il/api/v1`. Both hosts live in `MORNING_HOSTS`.
- **`POST /documents`:** required `type`, `lang`, `currency`, `vatType`, `income[]` (each `description`, `quantity`, `price`, `currency`, `vatType`); optional `client` (`{id}` for an existing client, or `name`, `emails`, `taxId`, `address`, `add`), `payment[]` (`date`, `type`, `price`, `currency`, plus `transactionId`, or `chequeNum`/`bankName`/`bankBranch`/`bankAccount` for a cheque), `linkedDocumentIds`, `linkType` (`link` | `cancel`), `description`, `remarks`. Reply 201: `{id, number, url: {he, en, origin}, …}`.
- **VAT-inclusive:** income `vatType` 0 = add VAT by business type, 1 = included in the price, 2 = exempt. The document `vatType` 0 = by business type.
- **Linking a receipt:** `linkedDocumentIds: [<300's id>]` on the 320 closes the חשבון עסקה. A 330 names the 320 it credits.
- **PDFs:** the create reply's `url`, or `GET /documents/{id}/download/links` → `{he, en, origin}`.
- **No-cost checks:** `POST /documents/preview` takes the same body and returns `{file: <base64 PDF>}` without issuing or counting.
- **Payment types:** 1 cash, 2 cheque, 3 card, 4 bank transfer, 11 other (needs a `subType` none of ours fits).
- **Errors:** `{errorCode, errorMessage}` in Hebrew (e.g. 2403 "סוג מסמך לא נשלח או אינו נתמך עבור סוג עסק זה", 2443 "נא למלא את פרטי הצ׳ק בשורת התקבול").
- **The sandbox business "test" was created as עוסק פטור** (`exemption: true`): 0% VAT, and 320/330 are refused for that business type. See "Sandbox run" below.

### Sandbox run (Nov 24, 2026)

On the local stack against the sandbox, order 1153 (team Orbit FRC 1690):
- billing details saved; the first הצעת מחיר failed with Morning's own message ("מספר עוסק / ח.פ אינו תקין", a tax id with a wrong check digit; the form now checks it), and "ניסיון חוזר" looked the reference up, created the Morning client, linked it to the team and issued **הצעת מחיר 300**, its number filled into the quote;
- the team approved; 30 seconds later **חשבון עסקה 40001** was issued by itself, linked to the same client;
- both documents carry "BLUEHUB, הזמנה 1153. סימוכין BH-…" in their remarks; the team's `/orders/<id>` lists them, and the PDF link returns Morning's PDF;
- "רישום תשלום" with the box ticked recorded the payment and wrote the 320 row (linked to the 300, repeating its lines). Morning refused it: the sandbox business is an עוסק פטור (error 2403). It waits as "לא הופק" with "ניסיון חוזר".

Still to run: once the sandbox business "test" is an עוסק מורשה (Morning › הגדרות › פרטי העסק), "ניסיון חוזר" on that 320, then cancel the order and "הפקת זיכוי" (330). Sandbox documents used so far: 2.

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
