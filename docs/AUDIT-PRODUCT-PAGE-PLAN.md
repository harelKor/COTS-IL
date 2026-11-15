# Fix plan for the product page audit (Nov 15, 2026)

Source: `docs/AUDIT-PRODUCT-PAGE-2026-11-15.md` (items P0-x, P1-x, P2-x). It was written from the live site at 820–910 px, without the code. Each item was checked against the code (`src/app/catalog/p/[slug]/page.tsx`, `src/components/family-view.tsx`, `src/domain/families/pick.ts`, `src/lib/description.ts`, `src/suppliers/classify.ts`). It was also checked on production at 1280×800 and 375×812 on the four audited pages.

Every session:
- reads CLAUDE.md, this file and the audit items its task names;
- keeps the current look (dark glass, pearl photo wells, pill chips, the vendor's colours). This is a usability pass, not a redesign (memory: design reviews keep the current look);
- keeps the click budget (CLAUDE.md): no confirm dialogs, never leave the page to add;
- puts pure logic in `src/domain` with Vitest tests;
- commits, merges to `main` and pushes, then checks the deploy;
- re-checks the four pages on production (`stealth-and-sushi-wheels`, `timing-belt-htd-5mm`, `kraken-x60-powered-by-talonfx`, `evo-shifter`) at 1280 and 375 px and ticks its row in the Progress table.

## Checked against the code

**Wrong or already done:**
- **P0-3 (variant not in the URL).** Already done. Once the choice settles, the URL becomes `?v=<sku>` with `router.replace` (no history entries), and the page reads it on load. Checked live: 1/2 Hex, 1 inch, 35A gives `?v=am-4541_green`. The audit stopped before the last option. Only a partial choice (two of three options) is not kept. That is a small add in PP2.
- **P0-1 (old products stay in the DOM).** This is Next 16's back/forward cache (React `Activity`): after A→B→C the two earlier pages stay in the DOM under `display:none`. Screen readers and `innerText` skip them, and search engines don't navigate on the client, so their JSON-LD is harmless. The real bug is smaller: hidden pages keep the same element ids (`option-bore`), so `getElementById` in "בחרו …" can hit the hidden copy. **Fix:** ids from `useId`, in PP1. Don't turn off the cache.
- **P0-4, the missing space in "באתרAndyMark".** Real on screen, but the cause isn't bidi. The `<a>` is `flex`, and flex drops the space at the end of the text before the `<Ltr>` item. **Fix:** a gap, or the text and name in one inline span.
- **P1-5, "the CTA does nothing" and "unavailable chips are a dead end".** Mostly done already:
  - "בחרו …" already scrolls to the missing group and flashes its border (`toMissing`). It's weak only when the group is already on screen.
  - Struck-through chips are already clickable: a clash picks the chip, clears the other choice and marks it "עודכן" (`choose`, `changedKeys`).
  - Left to do: an inline line under the group ("בחרו קדח"), a stronger struck-through look, `aria-disabled` plus a reason, and a tinted outline instead of the grey fill.
- **P1-3, "prices vanish on unrelated groups".** That is the audit's own rule at work: once 1 inch is picked, every bore costs ₪28, so the bore prices hide. Left to do: chips that lead to several prices say "מ-₪28".
- **P1-8, "`_orange` is an internal suffix".** `am-4541_orange` is AndyMark's own SKU, so it stays. Moving it off the photo is right.
- **P1-9, "Kraken photo is 325 px, ask for a larger one".** The page already asks for 2× through `srcset`. That first photo is only 650 px at the source, while the other five Kraken photos are 2000 px. **Fix:** make a large photo the main one, rather than tuning `srcset`.
- **P2-1 (description direction).** It already has `dir="ltr"` (computed `ltr`). Only `lang="en"` and the heading are missing.
- **P2-2 (thumbnails unlabeled).** They already have `aria-label="תמונה N"` and `aria-pressed`. Only "מתוך 6" is missing.
- **P1-1 (sticky).** The *info* column is the sticky one (`md:sticky`). It's taller than the screen, so it never sticks, and the gallery column is empty underneath. Moving the sticky to the gallery is right.
- **Phones already have a buy bar** (`data-buy-bar`). It's always shown, though, even while the real buy box is on screen.

**Confirmed (live):**
- The lightbox is see-through: `tile-fade` is 85–90% opaque over a 70% backdrop. There's no previous/next.
- Stealth and Sushi Wheels is under מנגנונים. Shopify rules read product type and tags before the title, and its "intake" tag wins (`src/suppliers/classify.ts`, `categorize`).
- The description shows "Description / Specifications / Documentation" as bullets.
- Promotional doc links: "Latest Motor Performance Analysis Report is now available!", "additional C ratio choice".
- The Kraken spec table shows `מתח` twice, beside English keys.
- The spec table lists every value: on EVO Shifter, 18 ratio strings per row. A second "מפרט <SKU>" table appears under the buy box.
- The timing belt's 6 thumbnails are 3 photos twice (the same `15mmBelt.png` and `9mmBelts.png` from WCP and CTRE).
- On phones the 54 teeth chips take 786 px. The buy box starts 1,519 px into the page, and the product name is 530 px down, below the photo.
- Kraken shows "כל האפשרויות (2)": the two vendors, which the supplier cards already show.
- The main photo doesn't follow the choice. Stealth variants have no photo of their own, although the gallery has `am-3155_green…` files.
- The headline stays "החל מ-₪28" whatever is picked.

**Added by this check:**
- **A1.** The phone puts the photo and thumbnails before the product name. Move the name and the "נמכר אצל" line above the photo on phones.
- **A2.** The second ratio group on EVO Shifter repeats the same 18 values. That is the supplier's data ("Stage A/B Ratio"), so leave it. The dropdown (P1-2) makes it short.
- **A3.** Hidden pages keep duplicate ids (see P0-1).
- **A4.** The spec key dictionary maps two keys to one Hebrew name (`voltage`, `volts`, and "operating voltage" all become מתח). Merge rows that share a translated key, not only the raw key.

## Tasks

Three sessions, one after the other (they share `family-view.tsx` and `page.tsx`).

### PP1. Gallery and lightbox (small; `family-view.tsx`)
- **Lightbox (P0-2):**
  - an opaque pearl panel and a `black/90` backdrop;
  - previous/next (mirrored for RTL), "3 / 6", the arrow keys, swipe, and a backdrop click to close;
  - the largest size.
- **Sticky gallery (P1-1):** the gallery column is sticky from `md` (top = header + 16). The info column isn't.
- **Photos (P1-9):**
  - dedupe by file name, without Shopify's `_<uuid>` and `?v=`;
  - when the first photo is small and a large one exists, the large one comes first;
  - thumbnails load eagerly;
  - no thumbnail strip for one photo;
  - the main photo follows the choice when the variant has a photo of its own. With a partial choice, it also follows a colour or durometer value whose word (green, orange, blue, black…) is in exactly one gallery file name.
- **SKU (P1-8):** off the photo, into the meta line "נמכר אצל AndyMark, מק״ט am-4541 [copy]", once the choice settles.
- **Accessibility:**
  - `useId` ids for the option groups (A3);
  - "תמונה 2 מתוך 6" with `aria-current` (P2-2);
  - on phones, the name and the "נמכר אצל" line above the photo (A1).

**Done when:**
- no page text shows through the lightbox, and every photo is reachable in it;
- the timing belt shows 3 thumbnails;
- the Kraken opens on a 2000 px photo;
- picking 35A on Stealth shows the green wheel;
- nothing sits on the photo but the zoom button.

### PP2. Choosing and buying (the big one; `family-view.tsx`, `src/domain/families/pick.ts`)
- **One helper in `src/domain/families`:** `remaining(selection)`, `priceRange(selection)` and `chipPreview(group, value, selection)`, which returns an exact price, "מ-₪X", or nothing when every chip in the group costs the same. The page reads only from it. Tests use Stealth (70 variants with gaps) and the timing belt (156, two vendors).
- **Headline (P1-4):** the range of what's left ("₪28 – ₪47"), or the exact price once settled.
- **Chips (P1-3):** the price a tap leads to: exact, or "מ-₪X".
- **Large groups (P1-2, the user chose a dropdown):** more than 8 values or labels over about 12 characters become one searchable field (a combobox):
  - it's styled like the chip cards (same surface and radius);
  - typing filters the list;
  - each row shows its price (the chip rule) and a muted "לא זמין" state;
  - it's a full-height list in a sheet on phones;
  - small groups keep their chips.
  - Small groups come first (width before teeth), unless the supplier's order is clearly meaningful.
  - Numeric values sort as numbers.
  - "2 Stage - 06.00:1" shows as "6:1" with "2 שלבים" under it. Only the label changes, never the SKU mapping.
- **Missing choice (P1-5):**
  - "בחרו קדח" is a tinted outline in the vendor's colour, not a grey fill;
  - a click scrolls and outlines the group, with a red line under its title;
  - struck-through chips get more contrast, `aria-disabled` and a reason ("לא זמין עם 1 inch");
  - after a clash, one line says what was cleared.
- **Supplier cards (P1-6):**
  - one fixed slot inside the buy box, above the quantity and Add, on every multi-vendor part;
  - shown from the start at full size with "מ-₪X", so nothing jumps when the choice settles;
  - when prices tie, a muted line "נבחר אוטומטית: זמין במלאי" (`offerReason` already gives the reason).
- **URL:** a partial choice is kept in the query too (`?bore=…`), with `replaceState`, and read on load.
- **Phone buy bar:** shown only once the buy box has scrolled out of view.
- **Desktop buy bar (P1-1):** not added (the user's decision). On computers, the sticky gallery and the shorter groups keep the buy box near the top.
- **Table link (P1-11):**
  - "הצגה כטבלה (156)" in the options area for parts with more than 12 variants;
  - "כל האפשרויות" is hidden when the variants differ only by vendor (Kraken).
- **Group semantics (P2-3):** each group is a `fieldset` with a `legend`.

**Done when:**
- the headline range equals the min and max of what's left;
- a chip's price equals the headline after the tap that settles it;
- nothing shifts when the last option is picked;
- at 1280×800 the timing belt and EVO Shifter show their options and Add within about 1.5 screens;
- no click on the page does nothing.

### PP3. Supplier data (`src/lib/description.ts`, `page.tsx`'s lower sections, `src/suppliers/classify.ts`)
- **Description (P0-4):**
  - drop the tab-label lists ("Description / Specifications / Documentation") and empty `<li>`;
  - `lang="en"`, and the heading "תיאור מהספק (אנגלית)" (P2-1).
- **Doc links (P0-4, P1-10):**
  - each link gets a type: CAD/STEP, user guide, drawing, datasheet, product page, other;
  - each gets a Hebrew label by type ("מדריך למשתמש", "קובצי CAD", "גיליון נתונים"), with the original text as a `title`;
  - links with promotional text and no file or doc target are dropped;
  - the "באתר <vendor>" space is fixed;
  - a row of up to 3 links in the buy box under the price note: `CAD ↗`, `מדריך ↗`, `דף המוצר אצל <vendor> ↗`.
- **One spec table (P1-7):**
  - "מפרט <SKU>" under the buy box goes away. The lower table shows the chosen value for option rows once picked, a short summary before that ("4 אפשרויות" or "30t – 300t"), never the whole list, and the fixed specs always;
  - `Key: Value` lines in the description (Stealth's Bore, Diameter, Durometer, Hole Pattern, Material, Weight, Width) become spec rows;
  - keys are merged by their Hebrew name (A4);
  - a small dictionary covers new keys (Material→חומר, Weight→משקל, Width→רוחב, Hole Pattern→תבנית חורים, Free Speed→מהירות חופשית, Stall Torque→מומנט עצירה…). An unknown key stays English inside `<Ltr>`, never half and half;
  - all of this is at render time, so no resync is needed.
- **Category (P0-5):**
  - Shopify products are classified title first, as BigCommerce already is (`categorizeByTitleFirst`);
  - before merging, a report lists every product whose category would change, from the local DB. The session posts the counts and samples, and goes ahead only if the moves look right;
  - production picks it up at the next daily sync, and admin category overrides still win.

**Done when:**
- no empty or tab-label bullets, and no two spec rows with one name;
- every doc link says what it opens;
- Stealth shows Material, Weight, Width and Hole Pattern, and sits under גלגלים ורולרים after the sync;
- the Kraken user guide is reachable without scrolling past the buy box.

### Not taken
- **P2-5 (search modal row without "+").** Outside the product page. It goes to T11 if still seen.
- **P2-6 (lead time under stock).** Already there: the "arrival" line from `leadTimes` shows when the admin set lead times (M4).

## Progress

| Task | Status | Commit |
|---|---|---|
| PP1 Gallery and lightbox | Done (Nov 15, 2026). The timing belt shows 2 thumbnails until a CTRE belt is chosen (its photo adds a third): the 6 were 2 photos repeated | `1b642d4` |
| PP2 Choosing and buying | Done (Nov 15, 2026). A group becomes a searchable list at more than 8 values, or labels over 12 letters in a group of more than 3 (EVO's three output shafts stay chips). The phone buy bar shows whenever the buy box is off screen, above or below it. On the timing belt the Add button sits about 830 px down at 1280×800, on EVO about 790 px | `323f517` |
| PP3 Supplier data | Not started | |
