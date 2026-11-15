# COTS-IL — Product Page UX Audit & Fix Spec

**For:** the Claude instance implementing changes in the COTS-IL codebase (cots-il.vercel.app).
**Scope:** the product page (`/catalog/p/[slug]`) and things that directly feed it (image lightbox, scraped supplier data, variant state).
**Audited:** 15 Nov 2026, desktop Chrome at ~820 px and ~910 px viewport widths. Pages reviewed: `stealth-and-sushi-wheels`, `timing-belt-htd-5mm`, `kraken-x60-powered-by-talonfx`, `evo-shifter`, and the catalog grid and search modal for context.
**Benchmarks:** WCP products as sold on the CTR Electronics store (store.ctr-electronics.com), wcproducts.com reference pages, and an Amazon product page with size variants (uxcell flanged bearings).

---

## 0. Ground rules (read first)

1. **Keep the existing visual language.** That means the dark navy surfaces, rounded cards, the per-supplier accent color (red for AndyMark, blue for WCP/CTRE), Hebrew RTL UI, pill-shaped option chips, and the light-grey image tile. This is a usability pass, not a redesign.
2. **Copy known patterns; don't invent new ones.** Every fix below points to a pattern people already know from Amazon or the WCP/CTRE store. If a fix needs explaining to the user, it's the wrong fix.
3. **Don't add features to add features.** Each item fixes an observed problem. Don't add reviews, wishlists, "frequently bought together", badges, or marketing blocks.
4. **Fix data at import, not just at render.** Many issues come from scraped supplier HTML. Clean it in the importer and also guard against it at render time.
5. Work in priority order (P0 → P1 → P2). Each item has **acceptance criteria**, and an item is done only when they pass.

---

## 1. What the page is today (for orientation)

RTL two-column layout. The gallery is on the right and the info column on the left.

```
[breadcrumb]
┌──────────── info column ────────────┐ ┌──── gallery ────┐
│ נמכר אצל <Supplier>                   │ │ main image      │
│ <Title>                              │ │ [⤢ lightbox]    │
│ ┌ option group (chips + price) ┐ ×N  │ │ thumbnails      │
│ ┌ supplier picker (sometimes) ┐      │ └─────────────────┘
│ ┌ buy box: price, stock, qty, CTA ┐  │   (empty space below)
│ ┌ variant spec "מפרט <SKU>" ┐ (after full selection)
└──────────────────────────────────────┘
[מפרט (all option values)]   [תיעוד (supplier links)]
[תיאור כללי של הספק (English scraped HTML, "קראו עוד")]
[כל האפשרויות (N) — collapsed sortable table w/ add buttons]
[מתאים לשימוש עם — compatible products grid]
```

**Keep these. They already match the benchmarks or beat them:**
- The CTA label says what's missing ("בחרו קדח", "בחרו קוטר") until the variant is resolved.
- Stock is shown with freshness ("זמין אצל הספק (נבדק לפני 4 שעות)"), and pre-order shows an ETA.
- Unavailable combinations get struck through, and the chips use `aria-pressed`.
- Supplier comparison cards appear on multi-supplier products.
- The "כל האפשרויות" table is sortable and has per-row add buttons, which power users will like.
- The "מתאים לשימוש עם" compatible-products grid.
- The "איך נקבע המחיר?" price explanation.

---

## 2. Benchmark takeaways (only the ones we act on)

| Pattern | Amazon | CTRE/WCP | COTS-IL today |
|---|---|---|---|
| Price per variant tile is the **exact** price of that choice | ✔ (plus unit price) | n/a (dropdown) | Mixed: "from" price, disappears after selecting |
| Many values (≈50 belt sizes) → **dropdown** | ✔ | ✔ "Belt Size" select | 56 chips in a wall |
| Gallery **sticky** while the info column scrolls | ✔ | ✔ | Not sticky; big empty area below gallery |
| Main image follows the selected variant | ✔ | ✔ | ✘ |
| SKU near the title | ✔ (in details) | ✔ "WCP-0160" under title | Overlaid on the image, only after full selection |
| Key specs as a short table **near the top** | ✔ 4–5 rows | ✔ bullets | Spec table far below, and it dumps every option value |
| Docs/CAD/guide links **next to the buy box** | n/a | ✔ "User Guide", "Belt Calculator", "CAD and Drawings" | Bottom section, scraped link text |
| Sticky add-to-cart bar when the buy box scrolls away | ✔ (mobile) | ✔ (wcproducts.com bottom bar) | ✘ |
| Variant is part of the URL (shareable) | ✔ | ✔ `?variant=` | ✘ |
| Missing-selection feedback | "Please select a size" on click | n/a | Disabled button that does nothing on click |

---

## 3. Issues & fixes

### P0: bugs and broken behavior

#### P0-1. Previous products stay mounted in the DOM after client-side navigation
- **Evidence:** I navigated Dualie Omni → Straight Flex → Stealth. The DOM then held **3 `<article>`s, 3 product `<h1>`s and 3 `Product` JSON-LD blocks**. Only one was visible. Text extraction and assistive tech can pick up the wrong product. On first load of the Stealth page, `get_page_text` returned the **Dualie Omni** text.
- **Likely cause:** route keep-alive (Next.js Activity/`cacheComponents`, a custom tab cache, or a layout that never unmounts the old page).
- **Fix:** render exactly one product per route. If keep-alive is intentional for back-nav speed, hidden instances must use `hidden`/`inert`. JSON-LD must be emitted only for the active route.
- **Accept:** after A→B→C client navigations, `document.querySelectorAll('main h1').length === 1` and there is exactly one `@type: Product` JSON-LD.

#### P0-2. The image lightbox is see-through
- **Evidence:** opening ⤢ on Kraken X60 shows the page text (title, price, CTA) **through** the image panel. The `<dialog>` has `background: transparent`, and the tile uses a `tile-fade` class, so the fade/mask exposes what's behind it. The backdrop is only `black/70`.
- **Fix:** give the lightbox panel a solid surface (the same light-grey image tile color) and a stronger backdrop (`black/85–90`). Also add the standard lightbox controls: prev/next arrows (mirrored for RTL), an "3 / 6" counter, ←/→ keys, swipe on touch, and click-backdrop-to-close.
- **Accept:** no underlying text is visible while the lightbox is open, and all images are reachable without closing it.

#### P0-3. The selected variant isn't in the URL
- **Evidence:** after selecting 1/2 Hex · 1 inch · 35A, the URL stays `/catalog/p/stealth-and-sushi-wheels`. A refresh loses the selection, and a team member can't send "this exact part" to the mentor who approves the order.
- **Fix:** sync selection to the query string with `history.replaceState`, as `?variant=<sku>` once resolved (partial selections can use option params). Read it on load and preselect. The copy-SKU button and catalog/cart links into the page should carry it.
- **Accept:** copying the URL after selecting and opening it in a new tab shows the same selection, price and SKU. Back/forward doesn't create one history entry per chip click.

#### P0-4. Scraped supplier content leaks into the UI
- **Evidence:**
  - Stealth description shows the supplier's tab labels **"Description / Specifications / Documentation" as bullet points**, and ends with an **empty bullet**.
  - Docs links use scraped banner text as link labels: *"Latest Motor Performance Analysis Report is now available!"*, *"Access User Guide, Kit Contents & More!"* (Kraken), *"additional C ratio choice"*, *"Please follow the NEO Press Fit Pinion Guide"* (EVO Shifter).
  - The docs label has a missing space: **"עמוד המוצר, CAD ותיעוד באתרAndyMark"** (also "באתרWCP"). This is a bidi + missing-space bug.
  - The Kraken spec table has **duplicate keys** (`מתח` twice: "Accommodates operating voltage up to 24V" and "6V - 24V") and **mixed-language keys** (`Communication Protocols`, `PWM Deadband` next to Hebrew `מתח`).
- **Fix (importer):** strip tab-nav lists, empty `<li>`, and "Description/Specifications/Documentation" headings. Dedupe spec keys by normalized key and keep the most specific value. Classify doc links (CAD/STEP, user guide, drawing, product page, other) and give each a clean Hebrew label, keeping the original text only as a `title` tooltip. Drop links whose text is promotional (no file or doc target).
- **Fix (render):** build the label as `עמוד המוצר, CAD ותיעוד באתר <bdi>{supplier}</bdi>` with a real space. Wrap every Latin-script value in `<bdi>`.
- **Accept:** no empty bullets, no tab-label bullets, no duplicate spec keys, and every docs link label states what it opens.

#### P0-5. Wrong category in breadcrumb
- **Evidence:** Stealth and Sushi Wheels sits under **"מנגנונים"**, while sibling wheels (Dualie Omni) sit under **"גלגלים ורולרים"**.
- **Fix:** audit the category mapping for wheels/rollers (probably a keyword rule matching "intake/mechanism" in the description before "wheel" in the title). Title keywords should beat description keywords.
- **Accept:** every product with "Wheel" in the title lands in גלגלים ורולרים unless explicitly overridden.

---

### P1: structure and flow (biggest usability wins)

#### P1-1. The buy box gets pushed below the fold, and the gallery column is empty underneath
- **Evidence:** EVO Shifter has 3 output options plus two groups of 16 long ratio chips each, so the price and CTA sit about two screens down. Timing Belt has 56 teeth chips before the CTA. Meanwhile the right column is empty below the thumbnails.
- **Fix (desktop ≥ md):** make the **gallery column `position: sticky; top: <header height + gap>`**, as CTRE and Amazon do, so it fills the empty space and stays visible while options scroll. Add a **compact sticky buy bar** at the bottom of the viewport that appears only when the real buy box is out of view. It shows a thumbnail, title, current price or "מ-₪X", the qty stepper, and the CTA. The CTA carries the same "בחרו X" logic (see P1-5). wcproducts.com does exactly this.
- **Fix (mobile):** the same sticky bottom bar, always visible after the buy box scrolls away.
- **Also:** P1-2 (dropdowns for large groups) removes most of the height problem at the source.
- **Accept:** on every audited product at 1280×800, either the CTA is visible or the sticky bar is visible at all scroll positions inside the product section. The gallery never leaves an empty column.

#### P1-2. Choose the option control by value count and label length
- **Evidence:** Timing Belt teeth is 56 chips in a ragged grid (rows of 7, then 6). EVO ratios are 16 long labels like "3 Stage - 05.45:1 Ratio 1.14:1" in uneven 2-column rows. CTRE uses a single "Belt Size" dropdown for the same product.
- **Rule:**
  - **≤ 8 values and short labels (≤ ~12 chars)** → keep chips (current design).
  - **> 8 values or long labels** → a **select/combobox** styled like the chips' card (same surface and radius), with type-to-filter. Each row shows the label and its price (P1-3 rules) and a muted "לא זמין" state. Sort numerically when the values are numeric (30t, 35t … 300t; 1:4.77 …).
- **Group order:** show **small, defining groups first** (Width 9/15 mm before Teeth). Default to ascending value count unless the supplier order is clearly semantic.
- **Labels:** normalize obvious scraped noise in option labels (zero-padding "06.00:1" → "6:1", collapse "2 Stage - " into a sub-label or a separate stage group if the data allows). Never change the underlying SKU mapping.
- **Accept:** no option group renders more than ~2 rows of chips. Timing Belt and EVO Shifter each fit the options + CTA within ~1.5 viewports at 1280×800.

#### P1-3. Prices on chips are inconsistent
- **Evidence (Stealth):** bore and diameter chips show prices, but durometer chips never do. After a bore and then a diameter are picked, the **bore chips lose their prices** while the diameter chips keep theirs. The values are "from" prices, but nothing says so.
- **Rule (Amazon pattern):** a chip's price = the price you'd get **if you clicked it, given the other current selections**.
  - If that click resolves to one variant → exact price, e.g. "₪28".
  - If several variants remain → "מ-₪28".
  - If every chip in a group would show the same price → show **no** prices in that group (less noise).
  - The rule applies to every group, including the selected one, at all times.
- **Accept:** prices never appear or disappear on unrelated groups when you click, and the price shown on a chip always equals the headline price after clicking it (when that click fully resolves the variant).

#### P1-4. The headline price doesn't narrow as you select
- **Evidence:** "החל מ-28 ₪" stays the same after picking bore and diameter, even though the remaining range changed.
- **Fix:** before full selection, show the **range of the remaining variants**: "₪28 – ₪47" (or "₪28" when only one price remains). When resolved, show the exact price plus stock line (as now). Keep the "איך נקבע המחיר?" link.
- **Accept:** the headline range always equals min/max over the variants that match the current partial selection.

#### P1-5. A disabled CTA gives no feedback, and unavailable chips are a dead end
- **Evidence:** the CTA "בחרו קדח" is a low-contrast maroon (AndyMark) or grey (WCP) disabled button, and clicking it does nothing. "Nub Bore" becomes struck-through and faint after picking 1 inch, with no explanation.
- **Fix:**
  - Keep the label logic, but render the button **enabled in a secondary style**. On click, scroll to the first incomplete group, outline it in the accent color, and show the inline error "בחרו קדח" under the group title (Amazon's "Please select a size").
  - Unavailable chips stay **clickable**. Clicking one selects it and clears the conflicting choice(s), with a one-line inline note: "קוטר 1 inch אינו זמין עם Nub Bore — בחרו קוטר". Add `aria-disabled="true"` and `title`/`aria-describedby` that say why ("לא זמין עם 1 inch").
  - Raise the contrast of the struck-through state a little. It currently almost disappears on navy.
- **Accept:** there's no click on the page that does nothing, and a keyboard user can reach and understand every option state.

#### P1-6. The supplier picker appears late, in two different places
- **Evidence:** on **Timing Belt** the "ספק" cards (WCP / CTR Electronics) show up only after the variant resolves, inserted above the buy box, so everything jumps down. On **Kraken X60** (no options) they sit directly under the title. Both suppliers show the same price and there's no hint why one is preselected.
- **Fix:** give the supplier picker **one fixed slot, inside the buy box right above qty + CTA**, on all multi-supplier products.
  - Before the variant is resolved, render it in its final size with each supplier's "מ-₪X" for the current partial selection, so there's no layout shift.
  - When resolved, show exact price + stock per supplier (as now).
  - Preselect by: in stock → lowest price → existing default. When prices tie, show a small muted note: "נבחר אוטומטית: זמין במלאי".
- **Accept:** no vertical layout shift when the last option is picked, and the same slot is used on every multi-supplier product.

#### P1-7. Two spec tables, and the product-level one dumps every option value
- **Evidence:** after selection, a **"מפרט am-4541_orange"** table appears under the buy box, and a second **"מפרט"** table appears further down. On EVO Shifter the lower table is a wall of every ratio string ("2 Stage - 04.77:1 Ratio, 2 Stage - 06.00:1 Ratio, …"). Meanwhile, real specs that exist in the scraped description (Stealth: *Hole Pattern, Material, Weight, Width*; Kraken: free speed, stall torque, weight) aren't in any table.
- **Fix:** keep **one** "מפרט" table, positioned where the lower one is now.
  - Rows for option dimensions show the **selected value** once chosen. Before that they show a compact summary ("4 אפשרויות" or a range like "30t – 300t"), never the full list.
  - Fixed attributes always show.
  - **Importer:** parse `Key: Value` lines from supplier spec blocks (they're already in Stealth's description as "Bore:, Diameter:, Durometer:, Hole Pattern:, Material:, Weight:, Width:") into structured spec rows. Variant-dependent values (Weight 0.03/0.1/0.17/0.3 lbs) should map per variant when the order matches the option order; otherwise show them as a list.
  - Translate spec keys to Hebrew through a small dictionary (Bore→קדח, Diameter→קוטר, Weight→משקל, Material→חומר, Width→רוחב, Voltage→מתח …). Keep untranslated keys in English inside `<bdi>`, and never mix two languages in one key.
- **Accept:** one spec table per page, no cell longer than ~3 lines, and Stealth shows Material / Weight / Width / Hole Pattern.

#### P1-8. The SKU is overlaid on the photo and appears only after full selection
- **Evidence:** the "am-4541_orange" pill sits on top of the main image. CTRE and Amazon put the SKU in the text near the title.
- **Fix:** move the SKU to the meta line under the title: `נמכר אצל AndyMark · מק״ט <bdi>am-4541</bdi> [copy]`. Before resolution, show the product-level part number if one exists, or nothing. Verify that the value shown is the **supplier's real part number**. If `_orange`/`_green` is an internal key suffix, show the supplier PN and keep the internal key out of the UI.
- **Accept:** nothing is overlaid on the product photo except the ⤢ button, and the SKU is selectable text and copyable.

#### P1-9. The gallery doesn't follow the selection, and image quality is weak
- **Evidence:**
  - Stealth has per-color thumbnails (green, orange, blue …), but selecting 35A (green) or 40A (orange) **never changes the main image**.
  - Timing Belt shows **6 visually identical** belt thumbnails.
  - EVO Shifter thumbnails rendered as **blank tiles** at first (lazy-loaded with no placeholder).
  - The Kraken main image's natural width is **325 px** for a ~360 px tile, so it's soft at 1× and blurry on retina.
- **Fix:**
  - When the resolved variant (or a partially selected option such as color/durometer) has a supplier variant image (Shopify `variant.featured_image`), switch the main image to it. Otherwise leave it as is.
  - Dedupe gallery images at import by Shopify file basename (strip `_<uuid>` and `?v=`).
  - Load thumbnails eagerly (they're tiny) or give them a skeleton.
  - Request large originals with `srcset` (Shopify CDN `&width=` params: 600/900/1400). The lightbox uses the largest.
  - Hide the thumbnail strip when there's only one image.
- **Accept:** picking 35A on Stealth shows a green wheel, there are no duplicate thumbnails, and the main image is sharp on a 2× display.

#### P1-10. Docs/CAD are buried and generic
- **Evidence:** the "תיעוד" card at the bottom is one generic link per supplier ("עמוד המוצר, CAD ותיעוד באתר …") plus scraped banner links. CTRE puts **User Guide** and **Belt Calculator** right by the CTA and has a **CAD and Drawings** accordion. For an FRC audience, CAD is a top reason to open a product page.
- **Fix:** keep the bottom "תיעוד" card (cleaned per P0-4), and add a **single row of up to 3 small links inside the buy box under the quote note**: `CAD ↗`, `מדריך ↗`, `דף המוצר אצל <ספק> ↗`. Show only the ones that exist, open in a new tab, and give each an external-link icon.
- **Accept:** on Kraken, the user guide is reachable without scrolling past the buy box.

#### P1-11. The "כל האפשרויות (N)" table is hard to find, and on single-variant products it's mislabeled
- **Evidence:** on Stealth (70 variants) and Timing Belt (156), the table is collapsed at the very bottom, under the description. On **Kraken X60** it says "כל האפשרויות (2)", but the 2 rows are the two suppliers, which already appear as cards at the top.
- **Fix:**
  - For products with **> 12 variants**, add a small text link "הצגה כטבלה (156)" in the options area header. It expands the table and scrolls to it.
  - For products with **one variant**, hide this section, since the supplier cards cover it.
- **Accept:** the table is reachable from the options area, and no section duplicates another.

---

### P2: polish

| # | Issue (evidence) | Fix |
|---|---|---|
| P2-1 | The English supplier description has no `lang`/`dir`. Its computed `direction` is `rtl` (it only looks left-aligned through `text-align`), so trailing punctuation, "(<50 lb.)" and "FIRST®" can render in the wrong place | Wrap it in `lang="en" dir="ltr"`, keep "קראו עוד", and label the heading "תיאור מהספק (אנגלית)" so the language switch is expected |
| P2-2 | Gallery thumbnails are buttons with `alt=""` and no label | `aria-label="תמונה 2 מתוך 6"`, plus `aria-current` on the active one |
| P2-3 | Option groups have no group semantics | Wrap each group in `role="radiogroup"` with `aria-labelledby` set to the group title (or keep `aria-pressed` buttons inside `<fieldset><legend>`) |
| P2-4 | The disabled AndyMark CTA is muddy maroon and reads as an error | Covered by P1-5. The secondary style should be a tinted outline in the supplier accent, not a dimmed fill |
| P2-5 | Search modal: one result ("Kraken Wire Bundle") has no "+" button while all others do | The same action column for every row ("+" or chevron for multi-option) |
| P2-6 | The stock line has no delivery expectation; the "משלוח וזמני אספקה" link exists in the price explainer only | If a typical lead time per supplier is known, add one muted line under stock: "אספקה משוערת לישראל: 2–4 שבועות". Otherwise skip this. Never invent a date |

---

## 4. Target layout (desktop, RTL)

```
[breadcrumb: קטלוג › גלגלים ורולרים › Stealth and Sushi Wheels]

┌──────────────── info column ─────────────────┐ ┌──── gallery (sticky) ────┐
│ Stealth and Sushi Wheels                     │ │                          │
│ נמכר אצל AndyMark · מק״ט am-4541 [⧉]          │ │   main image (follows    │
│ ₪28 – ₪47        ● זמין אצל הספק              │ │   selected color/variant)│
│                                              │ │                     [⤢]  │
│ קדח           [½ Hex][⅜ Hex][5mm Hex][Nub]    │ │ [t][t][t][t][t][t]       │
│ קוטר          [1"][2"][3"][4"]                │ └──────────────────────────┘
│ קשיות         [35A][40A][50A][60A][80A]       │
│   (>8 values or long labels → dropdown)      │
│                         הצגה כטבלה (70) ↘     │
│ ┌ buy box ───────────────────────────────┐   │
│ │ ספק: [WCP ₪26 ●] [CTR ₪26 ●]  (multi only) │
│ │ [ − 1 + ]  [ הוספה לסל / בחרו קוטר ]     │   │
│ │ לא מחייב תשלום · איך נקבע המחיר?         │   │
│ │ CAD ↗ · מדריך ↗ · דף המוצר אצל AndyMark ↗ │   │
│ └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
[מפרט: one table, selected values]   [תיעוד: cleaned, typed links]
[תיאור מהספק (אנגלית) … קראו עוד]
[כל האפשרויות (70): table]  (hidden for single-variant products)
[מתאים לשימוש עם]
──────────── sticky buy bar (only when buy box is off-screen) ────────────
[thumb] Stealth and Sushi Wheels · ₪28        [ − 1 + ] [ הוספה לסל ]
```

**Mobile order:** title + meta → gallery (swipe, dots) → price/stock → options → buy box → spec → docs → description → table → compatible, with the sticky bottom bar after the buy box scrolls away.

---

## 5. Not verified in this audit (check these before closing)

- **Wide desktop (≥1440 px) and real mobile (≤414 px):** the audit window was ~820–910 px wide, and the site blocks iframing, so I couldn't emulate mobile. Check both after the changes.
- **Add-to-cart feedback:** I didn't click "הוספה לסל" (I didn't want to change the live cart). Confirm the user gets clear feedback after adding: cart count animates and a toast or mini-cart appears with a "לסל" link. The page shouldn't navigate away.
- **Keyboard focus visibility** on chips, thumbnails and the lightbox.
- **The "+" on catalog cards for multi-variant products:** confirm it opens the option picker and doesn't add a default variant.

---

## 6. Suggested implementation order

1. P0-1 (DOM leak) and P0-2 (lightbox): small and isolated.
2. P0-3 (URL state). The variant-state refactor here is the base for P1-3, P1-4 and P1-5.
3. One **variant-resolution helper** (`remainingVariants(selection)`, `priceRange(selection)`, `chipPreview(group, value, selection)`, `isAvailable(...)`). P1-3, P1-4, P1-5 and P1-6 all read from it. Unit-test it with the Stealth (70 variants, gaps) and Timing Belt (156 variants, 2 suppliers) data.
4. P1-1 (sticky gallery + sticky bar) and P1-2 (dropdown rule).
5. Importer cleanup: P0-4, P0-5, P1-7 (spec parsing), P1-9 (image dedupe/variant images). Re-import and spot-check the 4 audited products.
6. P1-8, P1-10, P1-11, then P2.

After each step, re-check the four audited pages: `stealth-and-sushi-wheels`, `timing-belt-htd-5mm`, `kraken-x60-powered-by-talonfx`, `evo-shifter`.
