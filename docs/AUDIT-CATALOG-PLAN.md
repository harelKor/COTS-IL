# Fix plan for the catalog and filters audit (Nov 15, 2026)

Source: `docs/AUDIT-CATALOG-FILTERS-2026-11-15.md` (items P0-x, P1-x, P2-x). It was written from the live site at 820 px, without the code. Each item was checked against the code:
- `src/app/catalog/page.tsx`
- `src/components/catalog-browser.tsx`, `category-bar.tsx`, `vendor-filter.tsx`, `family-card.tsx`
- `src/lib/catalog.ts` (`getSpecFacets`, `getSupplierCounts`), `src/lib/catalog-filters.ts`
- `src/domain/families/parse.ts`, `src/domain/facets.ts`
- `src/suppliers/families.ts` (writes `spec_values`)

It was also checked on production at 1280×800, and against AndyMark's `/collections/gears` and McMaster-Carr's `/gears/` on Nov 15.

The user's complaint behind this plan: the catalog "is a little confusing and doesn't feel optimized and stable enough". So every task asks two questions: does it show the right parts, and does the page stay still while you use it.

Every session:
- reads CLAUDE.md, this file and the audit items its task names;
- keeps the current look: dark glass, the vendor logo chips, pill facet values, the FRC/FTC segmented control, the green stock dot, the card "+" (memory: design reviews keep the current look). This is a usability pass, not a redesign;
- puts pure logic in `src/domain` with Vitest tests;
- commits, merges to `main` and pushes, applying any migration first; then checks the deploy and waits for the build within its turn;
- re-checks on production: `/catalog`, `?group=motion`, `?category=gears` (+20 DP, +1/2" Hex, +a teeth range), `?category=bearings` and the list view, at 1280 and 375 px. Then it ticks its row in the Progress table.

## How the best parts stores do it (what we take)

- **McMaster-Carr** (the standard for industrial parts):
  - a group opens on **subcategory tiles** (photo, name, one line, count) before any product list;
  - facets are short lists with a **search box** inside long ones;
  - values are normalized (1/2", 5/8", never "0.5 in.");
  - some facets are **pictures** (gear, rack, hub).

  The left column scrolls with the page.
- **AndyMark** (the closest peer, Shopify):
  - every facet is **collapsed** by default in a plain left column that scrolls with the page;
  - there's a price facet;
  - cards show a **price range** ("$9.00 – $29.00").
- **Digi-Key / Mouser** (known for parametric filters):
  - each spec is one column of normalized values with counts;
  - numbers can be a from–to range;
  - "Apply" isn't needed when results update in place;
  - the active filters sit in one row with "clear all".
- **Amazon** (what everyone knows):
  - brand is a facet with checkboxes;
  - long lists end in "See more";
  - every active filter is removable in one place.

Common to all of them: **the navigation never changes shape** when you filter, and the values are clean. That is most of what feels "unstable" here.

## Checked against the code

**Confirmed (live and in the code):**
- **P0-1, values not normalized.** `spec_values` stores each supplier's own option text (`src/domain/families/group.ts`: `optionKey(o.name)`, `value: o.value`). Live in Gears:
  - קדח has `1/2" Hex` (14), `1/2 in. Hex`, `1/2 in Hex`, `0.5" Hex` and `1/2" Rounded Hex`;
  - שיניים has `12` beside `12t`, `14` beside `14t`;
  - קדח also lists `BAG`, `RS775`, `Falcon` and `Kraken`.
- **The 48t teeth limit is a cap.** `specFacets` keeps 60 values per facet (`.slice(0, 60)`). The duplicates use them up, so teeth stop at 48t while 56T and 200T gears exist.
- **P0-2, low coverage.** DP covers 45 of 167 gears. With 20 DP, 29 results come back without AndyMark's *Standard 20 DP Gears* and *20 DP Pinion Gears*, although "20 DP" is in their titles. Only option names feed the facets (plus a few title rules in `parse.ts` for teeth/bore/width/length, not DP).
- **P0-3, Stealth wheels under מנגנונים.** Fixed in PP3 (`categorizeShopify`), and it moves at tonight's sync. Not repeated here.
- **P1-1.** Counts sit against numeric labels ("29 20 DP").
- **P1-3.** The panel is `lg:sticky` with `overflow-y-auto no-scrollbar`: 1,075 px of content in a 703 px box, with no scrollbar.
- **P1-9.** With 20 DP chosen, the group bar shrinks from 6 tabs to "הכל | הנעה ותמסורת". This is the clearest "not stable" moment.
- **P1-10.** The supplier strip is ordered by count (`getSupplierCounts` … `orderBy(desc(count))`), so the order changes between views. The Thrifty Bot chip is a logo with no name.
- **P2-1.** The stock line is cut off ("67 מתוך 68 אפשרויות זמי…").
- **P2-2.** The price is on two lines ("החל מ-" over the amount).

**Added by this check:**
- **B1. No sign that a filter is working.** The old cards stay unchanged until the new list arrives (about 1–2 s on a cold cache), then everything jumps at once: the bar shrinks, the counts and the list change. Results should dim at once while they load (`useTransition` pending), and the controls around them shouldn't move.
- **B2.** Values are capped at 60 per facet and facets at 6 per category (`MAX_FACETS`), and nothing says so. After normalizing, the cap should come off the long ones (they get search + "show all").
- **B3.** Old links like `?s.bore=1/2 in. Hex` must keep working after normalizing: the filter values in the URL go through the same normalizer.

**Not taken, or changed:**
- **P2-7, the FRC/FTC pill in the header.** It's part of the brand mark (CLAUDE.md design tokens), so it stays.
- **P2-10, sort by newest.** Optional in the audit. There's no reliable "new" date, so it's skipped.
- **P2-6, pack size beside ₪1 items.** Only when the title states it ("Qty. 2", "10 Pack", "Pack of 25"), parsed at regroup. Never guessed.
- **P1-2's from–to range** is only for teeth, length and OD, where the values are numbers after P0-1.

## Tasks

Four sessions, one after another (CF2–CF4 share `catalog-browser.tsx`; CF2 needs CF1's clean values).

### CF1. Clean spec values (data; `src/domain/families`, `src/suppliers/families.ts`, `src/lib/catalog.ts`)
- **A normalizer per key in `src/domain/specs/`, plus a reviewed alias table** (`spec-aliases.ts`) so a new supplier is mapped by adding rows:
  - **bore** parses into shape (Hex, Rounded Hex, Round, Keyed, D, Spline) + size + unit, or a named spline (Falcon, Kraken, SplineXS, SplineXL, MAXSpline, NEO). The label is one form: `1/2" Hex`, `3/8" Hex`, `8mm Round`, `Falcon Spline`;
  - motor fits (`RS775`, `RS550/775`, `BAG`, `CIM`, `775pro`, `Kraken` when it means the motor) move to a new key `motor` ("התאמה למנוע");
  - **teeth** is a whole number shown as `12T`;
  - **DP / pitch / width / length / ID / OD** are a number + unit in one written form. Inch fractions stay fractions (the FRC way); mm stays mm.
- **More coverage:**
  - DP, teeth and bore also come from the title when the options don't give them (`/(\d+)\s?DP/`, `/(\d+)\s?(T|Tooth)/`, bore patterns), recorded with a `source` so a report can show where each value came from;
  - a family keeps every value its variants have (already true, since `spec_values` is per variant).
- **Report and gate:**
  - `npm run facet-coverage` prints, per category × facet, how many families have a value;
  - a Vitest test over fixtures fails when the normalizer leaves a known alias unmerged;
  - the session posts the before/after coverage for Gears, Bearings, Belts and Shafts.
- **Facets:**
  - remove the 60-value cap for facets that CF2 shows as a list;
  - URL values go through the normalizer (B3).
- **Rollout:**
  - all of this runs at regroup. Locally, `npm run regroup`; production at the next daily sync. Don't regroup production by hand without the user's OK;
  - a migration is needed only if a `source` column is added to `spec_values`. Apply it first with a dry run (`db push --remote`).

**Done when:**
- in Gears, קדח has one `1/2" Hex` whose count is the sum of the old spellings;
- no teeth value appears twice, and teeth go past 48;
- no motor names are under קדח;
- 20 DP includes AndyMark Standard 20 DP Gears, 20 DP Pinion Gears and the REV 20DP gears;
- DP coverage in Gears is at least 90%.

### CF2. The filter panel (`catalog-browser.tsx`, its filter components, `src/domain/facets.ts`)
- **Value chips (P1-1):**
  - the label first, then the count, muted and separated ("20 DP (29)"), the label in `<bdi>`;
  - the header badge is a small pill with a gap ("DP [1]").
- **Long facets (P1-2):**
  - up to 10 values stay chips;
  - more than 10 become a checkbox list (one per row, the count at the end), sorted as numbers when numeric and by count otherwise;
  - the first 8 show, then "הצגת כל N", with a search box at the top;
  - teeth, length and OD also get a from–to range (`?s.teeth=20-40`);
  - never a scroll box inside the panel.
- **Collapsing (P1-4):**
  - open by default: תוכנית, the stock switch and the two facets with the most coverage in the category;
  - the rest closed, with their selected count shown on the closed header;
  - what the user opened is remembered for the session (`sessionStorage`, in try/catch).
- **Scrolling (P1-3, the user's choice):**
  - the panel is a plain column that scrolls with the page (AndyMark/Amazon), no sticky inner scroll and no hidden scrollbar;
  - collapsed facets keep it short.
- **Search in the panel (the user asked for it):**
  - a search field at the top of the panel, "חיפוש בגלגלי שיניים…", narrows the results inside the current category and keeps the filters (`q` with `category`);
  - long facets use the same searchable list as the product page's option picker (PP2's combobox, reused, not a second copy).
- **Honest coverage (P0-2):** a muted line under a facet whose coverage is under about 90% ("ידוע ל-45 מתוך 167").
- **Price (P1-6):**
  - a "מחיר" facet with from/to fields on the family's lowest price (`min_list_usd` × rate, which is already stored);
  - `?price=50-200`, collapsed by default;
  - prices are shown only through `formatIls`.
- **Counts on the controls (P1-7):** "FRC (N)" and "FTC (N)" in the segmented control, and the switch says "רק מה שזמין אצל הספק (N)".
- **Phone drawer:** check it against the audit's mobile spec:
  - a full-height sheet with the same facets;
  - a sticky footer "הצגת N מוצרים" plus "נקה הכל";
  - the "סינון (3)" button shows how many are active.

**Done when:**
- in Gears at 1280×800 every facet title is visible without scrolling the panel;
- no facet is taller than about 320 px in its default state;
- every numeric facet runs ascending;
- no two numbers sit together without a separator.

### CF3. Navigation and stability (`category-bar.tsx`, `vendor-filter.tsx`, `catalog-browser.tsx`, `src/lib/catalog.ts`)
- **Stable bar (P1-9):**
  - the group tabs always show all groups, with their counts (0 shows greyed, never hidden);
  - moving to another group drops category-only spec filters, with a toast ("הסינונים של גלגלי שיניים הוסרו").
- **Pending state (B1):**
  - a filter click dims the results at once (`useTransition`), with a thin progress line;
  - the bar, the panel and the strip keep their size;
  - counts update in place, never by remounting.
- **Supplier strip (P1-10):**
  - one fixed order everywhere: the home page's vendor order (`homeVendorOrder`), not by count;
  - every chip shows the vendor's name with the logo;
  - edge fades and arrow buttons when it scrolls.
  - **multi-select (the user's choice):** the strip stays on top on every catalog page, and several vendors can be picked at once (`?supplier=wcp&supplier=andymark`, OR between them). The counts and `searchQuery` follow, and the vendor chips appear in the active-filters row.
- **One row of active filters (P1-5):**
  - directly above the results: supplier, program, in stock, each spec value, price, with "נקה הכל" (which keeps the category);
  - the category is no longer a removable chip but a breadcrumb "קטלוג › הנעה ותמסורת › גלגלי שיניים". You go up by a crumb.
- **Drill-down (P1-8):**
  - a group page (`?group=motion`) opens with a row of subcategory tiles (photo, name, count), the same photos the flyouts use;
  - a category page shows its siblings as small pills under the breadcrumb.
- **Results higher (P1-11):**
  - the breadcrumb and the title on one line;
  - the group bar sticks under the header once scrolled;
  - at 1280×800, at least one full row of cards is visible on a category page.
- **Header menu (P2-9):**
  - group titles in the header "קטגוריות" menu link to `?group=`;
  - both menus read the same data.

**Done when:**
- the group bar renders the same items in every state;
- the supplier order never changes between views;
- every active filter can be seen and removed from the results area;
- any category is one click from its group page.

### CF4. Cards and list view (`family-card.tsx`, the list view in `catalog-browser.tsx`)
- **Stock line (P2-1):**
  - one line that doesn't cut off: "● זמין: 67/68 אפשרויות";
  - the duplicate "N אפשרויות" at the bottom goes.
- **Price (P2-2, the user's choice):**
  - a range on one line, "₪26–₪148" (both through `formatIls`, `white-space: nowrap`), from the family's min and max (`min_list_usd`/`max_list_usd` × rate);
  - single-variant parts show one price.
- **List view (P2-3, P2-4):**
  - the meta line is built from separate spans, the vendor names in `<bdi>`, and only the vendor part is cut off;
  - 2–3 key spec columns per category from the clean values: Gears DP / שיניים / קדח; Bearings ID / OD; Belts pitch / teeth / width; Shafts shape / length. A small per-category map in `src/domain`.
- **Counts (P2-5):** every count goes through `countOf` (`src/domain/plural.ts`). No "1 מוצרים" anywhere in the catalog.
- **Pack size (P2-6):** "חבילה של 10" beside the price, only when the title says it.

**Done when:**
- no card line is cut off at 1280 or 375 px;
- the list view shows the key specs for Gears and Bearings;
- `grep` finds no hand-built "מוצרים" count.

## Progress

| Task | Status | Commit |
|---|---|---|
| CF1 Clean spec values | Done (Nov 15, 2026). Production updates after the nightly sync (02:00 UTC); no manual regroup | `0c2f918` |
| CF2 The filter panel | Done (Nov 15, 2026). Production shows the new spec values after the nightly sync | `17961e6` |
| CF3 Navigation and stability | Done (Nov 15, 2026) | `f73c694` (merged `1cf9d9e`) |
| CF4 Cards and list view | Not started | |

### CF1 notes (for CF2–CF4)

- **What runs where.** `src/domain/specs/`: `normalize.ts` (one normalizer per key), `spec-aliases.ts` (the reviewed table; a new supplier's spelling is a row there plus a fixture row in `spec-aliases.test.ts`), `extract.ts` (title, option-text and description reading), `variant-specs.ts` (what regroup stores per variant), `units.ts` (sizes in one form, `sortValue` for sorting across units). `parseFilters` runs URL values through `normalizeFilterValue`.
- **Value forms.** Bore `1/2" Hex`, `3/8" Hex`, `1/2" Rounded Hex`, `8mm Round`, `8mm Keyed`, `6mm D`, `8mm REX`, `SplineXS`, `Falcon Spline`, `15T Spline`; a size alone is Round, except `1/2"` and `3/8"`, which stay as the size (often hex in FRC, never guessed). Teeth and CD `12T`. `20 DP`; metric gears get a separate key `module` (`MOD 0.8`, label מודול). Pitch `#25 Chain`, `GT2 3mm`, `HTD 5mm`. Sizes `1/2"`, `1-1/8"`, `0.192"`, `8mm`, `1 ft`.
- **Motor key.** The new motor filter is `motor-fit` ("התאמה למנוע"), not `motor`: AndyMark already has an option named "Motor", whose label (מנוע) also builds labels like "סוג מנוע". Bores that name a motor (`Falcon`, `Kraken`) give both the spline bore and the motor.
- **`spec_values.source`** (migration `20261115151000`, applied): `option`, `title` or `description`.
- **Facets.** No 60-value cap, `MAX_FACETS` 8, values sorted by `sortValue` (sizes in mm). `motor-fit` usually falls under the 15% relevance share in Gears, so it doesn't show there yet.
- **Coverage, local DB** (`npm run facet-coverage`; local Gears has 139 families, production 167), before → after:
  - Gears: DP 37 (27%) → 47 (34%); DP or module 37 (27%) → 92 (66%); teeth 84 → 89 with 91 → 66 distinct values (no duplicates, 4T–200T); bore 40 (29%, 35 spellings) → 58 (42%, 21 values); material 82 → 86.
  - Bearings: bore 18 → 24; ID 60 (58 values) → 60 (47); OD 59 (65) → 59 (57); width 17 (23) → 17 (16).
  - Belts and chain: pitch 131 → 137; teeth 125 (197 values) → 139 (132); bore 41 (26) → 64 (21); material 65 → 74.
  - Shafts: bore 29 (36) → 54 (29); length 73 (197 values) → 73 (132); material 80 → 86.
- **Not met: DP ≥ 90% in Gears.** The 47 local Gears families left with no DP or module state none anywhere in their supplier data: WCP Swerve X/X2 spare gears, goBILDA and REV servo gear sets, swerve and hardware kits, AndyMark Sport gears. Not guessed. CF2's "ידוע ל-N מתוך M" line is the honest answer for them.

### CF2 notes (for CF3–CF4)

- **Where it is.** `src/components/filter-panel.tsx` (`FilterFields`, `PanelSearch`, sections, chips, the checkbox list, `RangeFields`); `catalog-browser.tsx` only lays it out (side column, phone sheet). Pure rules in `src/domain/facets.ts`: `facetLayout` (chips up to 10), `orderFacetValues` (by size when 75%+ have one, else by count), `previewValues`, `defaultOpenFacets`/`isFacetOpen`, `showsCoverage`, `parseRange`/`formatRange`/`rangeLabel`, `parsePrice`.
- **Filters gained `ranges` and `price`** (`CatalogFilters`). `?s.teeth=20-40`, `?s.length=2-6in`, `?s.od=10-30mm` (no unit: inches for length and OD), `?price=50-200` (whole ₪ on the family's lowest price, `min_list_usd` × rate, ±½ shekel). A key holds values or a range, never both (`toggleSpec`/`setRange`). `clearPanel` clears program, stock, specs, ranges and price and keeps the category, group, search and supplier; `panelFilterCount` is the "סינון (N)" number. CF3's active-filters row should list ranges and price too (the current row already does, as a stopgap).
- **Counts.** `SpecFacet` now carries `reach` and `total`. `getControlCounts` returns FRC, FTC and in-stock counts (each under the other filters) and the ₪ range in view; the store page passes them too.
- **Deviation from the plan, on purpose.** A long facet shows its 4 most common values (3 under a from–to range), not 8, and its search box appears with "הצגת כל N": with 44px rows that is what keeps every facet under ~320px. Local Gears at 1280×800: teeth 297px, material 281, the closed ones 49; Bearings ID 289, OD 301. "Every facet title visible without scrolling" is now a page scroll: the panel starts at about y=414 under the vendor tiles and the group bar, which is CF3's to raise (P1-11).
- **Shared with the product page.** `search-field.tsx` (`SearchField`, `fieldClass`) and `src/domain/list-search.ts` (`matchList`) are used by `option-combobox.tsx` too.
- **Open state** is per facet key for the session (`catalog-facets-open` in sessionStorage, with an in-memory fallback), shared by the side panel and the phone sheet.
- **Pending state (CF3, B1).** The panel's search uses `router.replace` after a 450 ms pause; the other controls `router.push`. Both run inside `startTransition`, so `pending` already dims the results.

### CF3 notes (for CF4)

- **Where it is.** `src/domain/catalog-nav.ts` (`keepsSpecs`, `moveTo`, `crumbTrail`, `groupMembers`, `scopeGroup`, `droppedText`), `src/components/catalog-nav.tsx` (the browser's transition as a context; `CatalogLink`, `interceptClick`), `catalog-heading.tsx` (breadcrumb + h1), `category-bar.tsx` (`useScopeLink`), `vendor-filter.tsx`. `catalog-browser.tsx` now renders the strip, the sticky bar, the heading, the tiles/pills and the active row itself; the pages pass `categories` (every category, with counts) and `suppliers` (every vendor in `homeVendorOrder`, with counts), and `underVendors` is gone.
- **Filters.** `CatalogFilters.supplier` is now `suppliers: string[]` (`?supplier=` repeated, sorted in the URL, OR in `searchQuery` with `&&`). `toggleSupplier`, `clearAll` (the results row's "נקה הכל": the panel plus the vendors; the category and search stay). A store passes `suppliers: [code]`. `toCards(rows, codes)` shows the chosen vendors' offer on each card; one vendor still sets `card.vendor`.
- **Counts.** The bar, tiles and pills count the current list without the spec filters and ranges (they belong to a category and are dropped on leaving it), so spec clicks never change the bar. The strip counts with them.
- **Stability, checked.** A panel click, a vendor click and a bar click keep the panel mounted, show no skeleton, and set `aria-busy` and the progress line at once (local, MutationObserver). Every state rendered the same 6 bar items and the same vendor order (local, 16 states at 1280 and 375).
- **Heights at 1280×800 (local).** Panel top 261 (was ~414). Category page: first card row 377–752. With an active-filters row it's 433–808, so CF4's card text changes should keep the cards from growing. At 375 the toolbar wraps to three short lines (title, count, then "סינון" and sort/view), as before.
- **Not done.** The store's own breadcrumb ("כל הספקים › WCP › …") doesn't show the group. The count words still read "5 מוצרים"/"1 מוצרים" in places (P2-5, CF4's `countOf` pass).
- **Testing tip.** When the app's browser pane is hidden, React's streamed reveal (with `<ViewTransition>`) waits for an animation frame and a fresh load can sit on "טוען"; a headless Playwright script doesn't have this.

