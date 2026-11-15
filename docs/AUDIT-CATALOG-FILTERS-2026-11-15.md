# COTS-IL — Catalog, Categories & Filters UX Audit & Fix Spec

**For:** the Claude instance implementing changes in the COTS-IL codebase (cots-il.vercel.app).
**Scope:** `/catalog` and its states, meaning the supplier strip, the category tab bar and its dropdowns, the header "קטגוריות" mega-menu, the filter side panel (`aside.filter-panel`), applied-filter chips, sort, the card/list views, and load-more.
**Companion doc:** `cots-il-product-page-audit.md`. Its ground rules apply here too.
**Audited:** 15 Nov 2026, desktop Chrome at ~820 px wide. Pages reviewed: `/catalog`, `?group=motion`, `?category=gears` (with and without the 20 DP facet), list view, in-stock toggle, price sort, and the header mega-menu.
**Benchmarks:**
- **McMaster-Carr** (`/gears/` → Spur Gears), the reference for industrial-parts navigation.
- **AndyMark** `/collections/gears`, the closest peer store with Shopify facets.
- **Amazon** search results, the facet panel everyone already knows.

---

## 0. Ground rules

1. **Keep the existing look.** That means the dark navy cards, logo chips for suppliers, the pill-style facet values, the segmented FRC/FTC control, the green in-stock dot, and the blue "+" quick-add.
2. **Copy what McMaster, AndyMark and Amazon already teach users.** That means normalized values, a count after each label, collapsible facet groups, one place for "what's applied + clear all", category → subcategory drill-down, and a facet panel that scrolls with the page.
3. **Data quality is the #1 filter problem here, not the UI.** Most P0s below are importer/normalizer work. A good-looking filter that silently hides the right products is worse than no filter.
4. Every item has acceptance criteria, and it isn't done until they pass.

---

## 1. What the catalog is today

```
[header: logo · קטלוג · קטגוריות▾ · ספקים▾ · search(modal) · cart · כניסה]
<h1> קטלוג / <group> / <category>
ספק:  [✓ כל הספקים] [WCP 1,155] [goBILDA 1,144] [AndyMark 1,071] [REV 387] [CTR 305] [Thrifty 247] [SDS 134]   ← horizontal scroller
[ הכל | חשמל ובקרה▾ | הנעה ותמסורת▾ | מבנה וחומרה▾ | מנגנונים ופניאומטיקה▾ | כלים ושונות▾ ]   ← group tabs + dropdowns
[ הנעה ותמסורת › גלגלי שיניים  × ]   ← category chip (only inside a category)
┌ filter panel (sticky, inner scroll) ┐  ┌ N מוצרים · [מומלץ▾] · [כרטיסים|רשימה] ┐
│ תוכנית: [הכל|FRC|FTC]               │  │ [DP: 20 DP ×] [נקה הכל]                 │
│ רק מה שזמין אצל הספק (switch)       │  │ 3-col card grid · 24 per page           │
│ (category only:) DP, שיניים, קדח, חומר │  │ [טעינת עוד מוצרים]                       │
└─────────────────────────────────────┘  └─────────────────────────────────────────┘
```

**Keep these. They're good and match the benchmarks:**
- Filters live in the URL (`category`, `group`, `s.<spec>`, `page`), so a filtered view can be shared and survives a refresh.
- Facet values show counts, and values that drop to 0 stay visible but greyed, so nothing jumps.
- Within one facet, multiple values combine with OR, which keeps the other DP values selectable.
- Supplier chips show live counts that respond to filters.
- There's an applied-filter row with ✕ per filter and "נקה הכל".
- The in-stock toggle, the card/list toggle, the quick-add "+" with an accessible label, and load-more with a "24 מתוך N" counter.
- The header mega-menu groups all 16 categories under 5 groups, each with an icon.

---

## 2. Benchmark takeaways (only what we act on)

| Pattern | McMaster | AndyMark | Amazon | COTS-IL today |
|---|---|---|---|---|
| Facet values **normalized** (one spelling per real value) | ✔ `1/8"`, `1/4"` | ✔ `0.125 in. [3.2 mm] (1/8) Round` | n/a | ✘ `1/2" Hex` / `1/2 in. Hex` / `1/2 in Hex` / `0.5" Hex` as 4 values |
| Values **sorted** numerically | ✔ | ✔ | ✔ | Partly: `12`, `12t`, `13t`, `14`, `14t` … interleaved |
| Long value lists → **search box inside the facet** + list | ✔ | scroll list | "See more" | 80+ chips in a wall |
| Count shown **after** label, visually separate | no counts | `Label (5)` | n/a | `29 20 DP`, `4 32t` (count glued to a number) |
| Facet groups **collapsible**, long ones collapsed by default | n/a (all open) | ✔ all collapsed | ✔ | All open, each one a wall |
| Facet panel scroll | page/left column with **visible scrollbar** | page scroll | page scroll | Sticky panel with **inner scroll and hidden scrollbar** (`no-scrollbar`) |
| Subcategory drill-down **on the page** (cards with image + count) | ✔ big tiles | breadcrumb | Department tree in panel | Only in dropdowns; nothing on the page |
| A picture explaining a dimension (e.g. which "diameter") | ✔ shaft-diameter diagram | – | – | – |
| Price shown as range for multi-variant items | per row | ✔ `$9.00 – $29.00` | – | `החל מ-₪26` + separate "N אפשרויות" |
| **Price** facet | – | ✔ | ✔ | ✘ |
| One "Clear all" at the top of the panel | ✔ | – | ✔ | Clear-all lives above results; the category chip has its own ✕ elsewhere |

---

## 3. Issues & fixes

### P0: filters return wrong or incomplete results (data)

#### P0-1. Facet values aren't normalized, so the same thing appears 2–4 times
- **Evidence (`?category=gears`, from the panel text):**
  - **קדח:** `1/2" Hex (14)`, `1/2 in. Hex (1)`, `1/2 in Hex (1)`, `0.5" Hex (1)`, `1/2" Rounded Hex (1)` · `3/8" Hex (12)`, `3/8 in. Hex (1)`, `3/8 in Hex (1)` · `1/8" (1)`, `1/8 in. Round (1)`, `0.125" Round (2)` · `8mm`, `8 mm Round`, `8mm Round`, `8 mm Key`, `8mm Key`. The same facet also mixes in non-bores: `BAG`, `RS550/775`, `RS775`, bare `Hex`, bare `Round`, `Falcon`, `Kraken`.
  - **שיניים:** `11` and `11t`, `12` and `12t`, `14` and `14t` … for almost every number (each supplier writes it differently).
- **Effect:** a student who picks `1/2" Hex` sees 14 gears and misses the ones tagged `1/2 in. Hex` / `0.5" Hex`. They think they've seen everything when they haven't.
- **Fix (importer → canonical spec values):** write a normalizer per spec key, run it at import time, and keep the raw value for display on the product page if you like.
  - **Bore:** parse into `{shape: Hex|Rounded Hex|Round|Keyed|D|Spline, size, unit, spline: Falcon|Kraken|SplineXS|MAXSpline|…}`. Canonical label: `½" Hex`, `⅜" Hex`, `8 mm Round`, `Falcon Spline`, `Kraken Spline`. Map `0.5"`, `1/2 in.`, `1/2"` to the same value. Motor-mount strings (`RS775`, `BAG`) go to a separate key "התאמה למנוע", not to bore.
  - **Teeth:** strip the `t`/`T`/` Tooth` suffix, store an integer, and display as `12T`.
  - **DP / pitch / width / length:** store a number plus a unit. Show both units where the FRC audience mixes them (AndyMark pattern `0.125 in. [3.2 mm]`), or follow the supplier's native unit.
  - Keep a reviewed **alias table** in the repo (e.g. `data/spec-aliases.ts`) so new suppliers are mapped by adding rows, not by editing code.
- **Accept:** in Gears, the bore facet has exactly one `½" Hex` value whose count equals the sum of the old variants. No teeth value appears twice. No motor names are in the bore facet.

#### P0-2. Facet coverage is low, so filtering silently drops products
- **Evidence:** in Gears (167 products), the DP facet counts add up to **45** (3+9+29+4), so **~122 gears have no DP value**. Applying **20 DP** returns 29 products and **excludes** AndyMark *Standard 20 DP Gears*, AndyMark *20 DP Pinion Gears*, REV *20DP Gears – ½in Hex*, REV *20DP Gears – MAXSpline* and *Robits 20 DP Gears*, even though "20 DP" is in their titles. Material counts add up to 83 of 167.
- **Fix:**
  - **Extraction:** fill specs from (1) supplier spec fields, then (2) variant option names, then (3) title regexes (`/(\d+)\s?DP/i`, `/(\d+)\s?(t|T|tooth)/`, bore patterns). Record the source per value so it can be audited.
  - **Product-level union:** a product with variants spanning 12–60T or ½"/⅜" bores should carry *all* the values its variants have, so filtering by `20T` keeps a multi-variant gear family.
  - **UI honesty:** under each facet title, when coverage is under ~90%, show a muted line: `ידוע ל-45 מתוך 167`. Optionally add a "לא צוין" value so users can include unknowns.
- **Accept:** for Gears, DP coverage ≥ 95%, and every product with "20 DP"/"20DP" in its title appears under 20 DP. Add a small script (`scripts/facet-coverage.ts`) that prints coverage % per category × facet. Run it in CI and fail if any top facet drops below a threshold.

#### P0-3. Wrong categories (seen on the product page too)
- **Evidence:** *Stealth and Sushi Wheels* sits under "מנגנונים" while sibling wheels sit under "גלגלים ורולרים".
- **Fix:** title keywords beat description keywords in the category classifier. Add a coverage report listing products whose category disagrees with title keywords.
- **Accept:** the report is empty for "wheel/gear/belt/pulley/bearing/motor" keywords, or every entry has an explicit override.

---

### P1: filter panel usability

#### P1-1. Counts are glued to numeric labels and read as one number
- **Evidence:** chips render `29 20 DP`, `4 32t`, `10 45t`, `19 15t`. At a glance "4 32t" reads as "432t". The facet header also reads `DP1`, where the selected-count badge touches the title.
- **Fix:** label first, count second, visually secondary and separated, in the **same direction for every value**: `20 DP · 29` or `20 DP (29)` as AndyMark does. Use `<bdi>` around the label so RTL doesn't flip the order. Put the header's selected badge in a small pill with spacing: `DP  [1]`.
- **Accept:** no chip shows two numbers next to each other without a separator.

#### P1-2. Long facets are chip walls
- **Evidence:** Gears → **שיניים** has 80+ chips (a 5-column wall that needs inner scrolling), and **קדח** has ~40 chips with long labels.
- **Rule (McMaster/AndyMark):**
  - **≤ 10 values** → keep pill chips (current design).
  - **> 10 values** → a **checkbox list**: one value per row, label on the right and count on the left (RTL), sorted **numerically** for numeric facets and by count otherwise. Show the first 8 with a "הצגת כל 64" toggle, plus a **search box** at the top of the facet. McMaster puts a search box in every long facet.
  - **Numeric facets with many values (teeth, length, OD)** → optionally a **range** (two inputs "מ-" / "עד", with an optional slider) *in addition to* the list. For teeth, a range like `20–40` is what students actually want.
- **Accept:** no facet is taller than ~320 px when collapsed to its default state, and every numeric facet is sorted ascending.

#### P1-3. The panel scrolls inside itself with a hidden scrollbar
- **Evidence:** `aside.filter-panel` is `lg:sticky`, `max-h-[calc(100dvh-96px)]`, `overflow-y-auto`, `no-scrollbar`. Its content is 769 px in a 504 px box, so a third of the filters are invisible and there's **no visual cue** that the panel scrolls. Wheel-scrolling over it scrolls the panel instead of the page. The Teeth facet then adds a second nested scroll area.
- **Fix:** pick one option.
  - **(a) Recommended, Amazon/AndyMark style:** the panel is not sticky and scrolls with the page. Facets collapse (P1-4), so it stays short.
  - **(b)** Keep it sticky, but show a visible thin scrollbar (remove `no-scrollbar`), add a bottom fade/shadow when more content is below, and never nest a second scroll area inside it.
- **Accept:** every filter can be reached with a mouse wheel and with the keyboard, and it's obvious more filters exist below the fold.

#### P1-4. Every facet is fully expanded
- **Fix:**
  - Open by default: **תוכנית**, the in-stock switch, and the **two most-used facets** of the category. Configure these per category, e.g. Gears = DP + שיניים, Bearings = קדח + OD.
  - Everything else collapsed, with the selected-count badge visible on the header when collapsed.
  - Remember per-session which ones the user opened. `sessionStorage` is fine here.
- **Accept:** in Gears at 1280×800 you can see all facet *titles* without scrolling the panel.

#### P1-5. Applied filters are split across three places
- **Evidence:**
  - The category shows as a breadcrumb-chip `הנעה ותמסורת › גלגלי שיניים ✕` above everything.
  - Spec filters show as chips `DP: 20 DP ✕` plus `נקה הכל` in a row above the results.
  - The supplier filter shows only as a selected logo in the scroller, which may be scrolled off-screen.
  - Program and stock show only as control states.
- **Fix:** one **applied-filters row** directly above the results that lists **all** active filters as chips: `ספק: AndyMark ✕`, `תוכנית: FRC ✕`, `רק במלאי ✕`, `DP: 20 DP ✕`, `שיניים: 20–40 ✕`, followed by `נקה הכל`. Keep the category as a **breadcrumb** (not a dismissible chip): `קטלוג › הנעה ותמסורת › גלגלי שיניים`. Going "up" is clicking a crumb, as on McMaster and AndyMark. "נקה הכל" clears filters but keeps the category.
- **Accept:** from the results area alone you can see and remove every active filter, and the category is changed only via breadcrumb/nav.

#### P1-6. No price filter
- **Evidence:** price exists on every card and in sort, but there's no price facet. AndyMark and Amazon both have one.
- **Fix:** a "מחיר (₪)" facet with min/max inputs (and an optional slider), using the card's "from" price. Collapse it by default.
- **Accept:** `?price=50-200` works in the URL and is reflected in the applied-filters row.

#### P1-7. "תוכנית" and stock controls give no counts
- **Fix:** show counts in the segmented control, `FRC · N`, `FTC · N`, or as a tooltip if space is tight. Phrase the switch with a count too: `רק במלאי אצל הספק (4,057)`.
- **Accept:** a user can tell what a toggle will do before clicking it.

---

### P1: category navigation

#### P1-8. Picking a group or category gives no on-page way to drill down
- **Evidence:** on `?group=motion` (1,182 products) the page shows the group title and a product grid. The 5 subcategories (הנעה ושלדה 263, תיבות הילוכים 203, גלגלי שיניים 167, רצועות… 310, גלגלים ורולרים 239) are only reachable by opening a dropdown. McMaster's first screen for "Gears" is **subcategory tiles** (image, name, one-line description, product count). Amazon puts the department tree in the left panel.
- **Fix:** on a **group** page, render a compact row of **subcategory tiles** above the grid: image + name + count, horizontally scrollable on mobile, using the same images the dropdown already shows. On a **category** page, show sibling categories as small pills under the breadcrumb (`גלגלי שיניים · תיבות הילוכים · רצועות…`) so lateral moves take one click.
- **Accept:** from any group page, any category is one click away without opening a menu.

#### P1-9. The group tab bar changes shape when a filter is applied
- **Evidence:** after selecting 20 DP inside Gears, the tab bar collapsed from 6 tabs to just `הכל | הנעה ותמסורת▾`. The other groups disappeared, presumably because they have 0 results for `s.dp`.
- **Fix:** primary navigation must be stable. Always render all groups. Spec filters are category-scoped, so navigating to another group should **drop** category-specific spec filters (and say so in a toast: "הסינונים של גלגלי שיניים הוסרו"), not hide the destination.
- **Accept:** the tab bar renders the same items in every catalog state.

#### P1-10. The supplier strip is a horizontal scroller with no affordance
- **Evidence:**
  - At ~820 px, CTR is cut off on the left edge, and Thrifty Bot and SDS are off-screen with no arrows or fade.
  - The order changes between views (re-sorted by count per view): at root it's WCP, goBILDA, AndyMark, REV, CTR, Thrifty, SDS. In Motion, SDS jumps ahead of CTR and Thrifty.
  - The Thrifty Bot's logo is a small robot icon with no visible name. The accessible name exists, but sighted users can't tell who it is.
  - The strip and title take ~110 px above the category tabs on every page.
- **Fix:**
  - Keep the logo chips (they're on-brand), but use a **stable order** (alphabetical, or a fixed curated order) and a fade + arrow buttons at the scroll edges. Every chip shows the supplier **name** under or beside the logo, not just the count.
  - Make supplier **multi-select**, the same as facet values, and add it to the applied-filters row.
  - On category pages, consider moving supplier into the filter panel as the first facet (logo + name + count list), which is where Amazon/AndyMark users look for "Brand". The strip can remain on the root `/catalog` as a visual entry point.
- **Accept:** all suppliers are discoverable without horizontal scrolling on 1280 px, the order never changes between views, and multi-select works.

#### P1-11. Results start low on the page
- **Evidence:** at 820×601 the first product row starts at ~y=370 (title + supplier strip + tab bar + category chip + toolbar). On McMaster, products or subcategory tiles start right after a single breadcrumb row.
- **Fix:** after P1-5/P1-10, the vertical order becomes breadcrumb + `<h1>` on one line, the tab bar, then results. The supplier strip shows only on root `/catalog`. Make the tab bar sticky under the header once scrolled.
- **Accept:** at 1280×800, at least one full row of cards is visible on a category page without scrolling.

---

### P2: cards, list view, small things

| # | Issue (evidence) | Fix |
|---|---|---|
| P2-1 | Card stock line truncates: `120 מתוך 180 אפשרויות זמי…`, and the option count is repeated at the bottom (`180 אפשרויות`) | One line, `● במלאי · 120/180 אפשרויות`. Remove the duplicate count at the bottom |
| P2-2 | Price is `החל מ-` + `₪1,996` on two lines; list view wraps it to `החל` / `מ-113 ₪` | Show a range like AndyMark, `₪26–₪148`, on one line with `white-space: nowrap`. Use a single price for single-variant items |
| P2-3 | List view meta line has broken bidi and truncation: `148 ,WCP, CTR Electronics אפ...` | Build it as separate spans: `<bdi>WCP, CTR Electronics</bdi> · 148 אפשרויות`, and truncate only the supplier part |
| P2-4 | List view shows no more info than cards, so it isn't worth switching to | Add 2–3 **key spec columns** per category (Gears: DP · שיניים · קדח; Bearings: ID · OD · סוג). This is McMaster's core idea, made light |
| P2-5 | `1 מוצרים` (REV chip in 20 DP view) | Pluralize: `מוצר אחד` / `N מוצרים` via a helper |
| P2-6 | ₪1 items (#6 fender washer, rubber bands, screws) give no pack size, so it's unclear what ₪1 buys | Show the pack quantity when known (`חבילה של 10`) or the unit (`ליחידה`) next to low prices |
| P2-7 | The "FRC / FTC" pill in the header is part of the logo link, but it looks like a toggle | Restyle it as plain text in the logo lockup, or make it a real global program switch synced with the תוכנית facet. Don't leave a control-looking thing that isn't a control |
| P2-9 | Header mega-menu and in-page tab dropdowns are two different designs of the same tree; header groups have no counts and aren't links | Fine to keep both (Amazon does), but share one component and data source, and make group titles links to `?group=` |
| P2-10 | Sort has no "חדש" (newest) or "זמינות" | Optional. Add only if the data has reliable dates or stock |

---

## 4. Target layout (desktop, RTL; category page)

```
[header]
קטלוג › הנעה ותמסורת › גלגלי שיניים                                  (breadcrumb)
גלגלי שיניים                                         167 מוצרים
[ הכל | חשמל ובקרה▾ | הנעה ותמסורת▾ | מבנה וחומרה▾ | מנגנונים…▾ | כלים…▾ ]   (stable, sticky)
גלגלי שיניים · תיבות הילוכים · רצועות וגלגלות · גלגלים ורולרים · הנעה ושלדה      (sibling pills)

┌ filters (scrolls with page) ─────┐  ┌──────────────────────────────────────────────┐
│ נקה הכל                           │  │ [ספק: AndyMark ✕] [DP: 20 ✕] [שיניים 20–40 ✕] נקה הכל │
│ תוכנית [הכל | FRC · N | FTC · N]  │  │ 58 מוצרים               [מומלץ▾]  [▦|☰]          │
│ ◉ רק במלאי (4,057)                │  │ ┌card┐┌card┐┌card┐                            │
│ ▾ ספק        [list w/ logos]      │  │ │ img ││ img ││ img │                         │
│ ▾ DP  [1]    10 · 12 · 20✓ · 32   │  │ │AndyMark · am-xxxx                              │
│ ▾ שיניים     [מ-][עד] + list+search│  │ │Standard 20 DP Gears                            │
│ ▸ קדח                             │  │ │● במלאי · 67/68 אפשרויות                         │
│ ▸ חומר                            │  │ │₪26–₪148                          [+]          │
│ ▸ מחיר (₪)                        │  │ └─────┘└─────┘└─────┘                           │
│   ידוע ל-45 מתוך 167 (per facet)  │  │ [טעינת עוד מוצרים]                               │
└──────────────────────────────────┘  └──────────────────────────────────────────────┘
```

**Group page** (`?group=motion`): the same layout plus a row of **subcategory tiles** (image · name · count) above the grid.

**Mobile:**
- Breadcrumb, then title, then a horizontal subcategory/sibling pill row.
- A sticky toolbar `[סינון (3)] [מיון▾] [▦|☰]`. "סינון" opens a full-height drawer with the same facets, a sticky footer `[הצג 58 מוצרים]` and `נקה הכל`.
- The applied-filters chip row is horizontally scrollable under the toolbar.

---

## 5. Not verified in this audit

- **Mobile and wide desktop.** The window was ~820 px, and the site refuses iframes, so I couldn't emulate a phone. A `סינון` button and a hidden `הצגת 4,247 מוצרים` button exist in the DOM, so a mobile drawer with a results footer exists. Check it against the mobile spec above.
- **Whether the Teeth facet is truncated.** The list in Gears ended at `48t`, but gears with more teeth exist (e.g. 50T, 56T, 200T titles). Check for a value cap.
- **Keyboard and screen-reader behavior** of chips, the switch and the dropdowns. The DOM uses `aria-pressed`/`role=switch` correctly; focus order and visibility weren't tested.
- **Search results page:** the header search is a modal. Whether it has a full results page with the same filters wasn't tested.

---

## 6. Suggested implementation order

1. **Normalizer and alias table** (P0-1), then **re-import**.
2. **Spec extraction from variants and titles + product-level union** (P0-2) and the **coverage script** in CI. Re-check: 20 DP must include AndyMark Standard 20 DP Gears and REV 20DP Gears.
3. Category classifier fix (P0-3).
4. Facet rendering rules: label/count format (P1-1), list vs chips + search + numeric range (P1-2), collapse defaults (P1-4), panel scrolling (P1-3).
5. Unified applied-filters row + breadcrumb (P1-5), stable tab bar (P1-9), price facet (P1-6), counts on program/stock (P1-7).
6. Category drill-down tiles/pills (P1-8), supplier strip changes (P1-10), vertical space (P1-11).
7. P2 items.

After each step, re-check `/catalog`, `?group=motion`, `?category=gears` (+20 DP, +½" Hex, +teeth range), and list view.
