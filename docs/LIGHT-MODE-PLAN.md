# Light mode plan (Nov 15, 2026)

The user asked for a light mode on Nov 15, 2026. This reverses the Nov 14 rule in CLAUDE.md ("one dark system, no light/dark switch") by the user's own decision. **Dark stays as it is; light is added beside it.**

## Decisions (the user's, Nov 15)

- **Switching:** the first visit follows the device's light/dark setting. A sun/moon switch in the header (in the account menu on phones) overrides it, and the choice is remembered.
- **Scenes:** the home page and the vendor stores get real **daylight versions**, not a dark island inside a light site.
- **Look:** **pearl & ultramarine**:
  - white and pearl surfaces with soft shadows;
  - Orbit ultramarine as the brand colour;
  - vendor colours as tints, borders and glows;
  - close to the light theme before Nov 14 (`git show a8821f5~1:src/app/globals.css`), refreshed for today's layout.

## Definition: what "light mode" means here

| | Dark (today, unchanged) | Light (new) |
|---|---|---|
| Canvas | midnight #020416 with an ultramarine glow at the top | pearl #F6F7FF with a soft ultramarine wash at the top |
| Surfaces | navy glass #0B1336, ultramarine hairline inside | white, a #DCE2FA hairline, a soft blue-grey shadow (no glass blur, audit S-1) |
| Text | #F1F4FF, secondary #A3AED6 | #0B1528, secondary #52658A (both AA at 13px on pearl and white) |
| Brand | text tint #8094FF, fills #0018E0 | text and fills #0014BE (strong #000C8A), soft #E0E5FF |
| Status | green #4ADE80, amber #FBBF24, red #F87171 | green #177A33, amber #995A00, red #D70015 (CLAUDE.md "Status") |
| Product photos | pearl wells on dark | the same pearl wells, framed by a hairline so they don't melt into a white card |
| Vendor colours | deep fills, white-ink logos, glowing glass | the vendor's primary as tint and border, a pale wash of its colour, **its logo in its own colours** |
| Hot rows (fire) | ember glow on navy | warm amber/orange wash on pearl, a darker flame for contrast |
| Header | translucent midnight | translucent white with blur, hairline bottom |
| Print | black on white | the same |

The rules that hold in both modes:
- AA contrast for all text (13px minimum);
- the brand never as the only signal;
- one primary button per screen;
- RTL;
- the 44px targets;
- motion only on transform/opacity.

## How it works (technical)

- **Tokens:** `globals.css`:
  - `:root` keeps the dark tokens;
  - light overrides live under `:root[data-theme="light"]` and under `@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) { … } }`, so the device setting works with no script and a choice wins over it;
  - `color-scheme` follows the theme;
  - every colour in components must come from a token. The ~200 raw `rgb()`/hex values in `globals.css` past `:root`, and the `text-white`/`bg-white`/`bg-black/…` classes in about 15 TSX files, either become tokens or are checked to be meant for both modes (white text on a deep brand fill stays white).
- **No flash, still static pages:**
  - an inline script in `<head>` (in `src/app/layout.tsx`, before paint) reads the saved choice from `localStorage` (in try/catch) and sets `data-theme` on `<html>`;
  - no cookie and no server read, so pages stay prerendered and cached (`cacheComponents`);
  - the theme is only ever set on `<html>`, never derived from page content. That is the lesson of the Nov 14 half-dark bug (Next keeps visited pages hidden in the DOM, so `body:has(...)` leaked across pages).
- **The switch:**
  - a `ThemeToggle` (sun/moon, 44px, `aria-pressed`, label "מצב בהיר"/"מצב כהה") in the header from 1024px, and in the account/guest menu below that;
  - three states internally (device, light, dark): clearing the choice returns to the device setting, offered as "לפי המכשיר" in the menu.
- **The welcome note (the user asked for it):**
  - a small glass pop-up at the **top left** of the page (`inset-inline-end`, under the header) appears when someone enters the site;
  - it says which mode the site is in ("האתר במצב כהה" / "האתר במצב בהיר", with the sun or moon icon), with a switch button ("למצב בהיר" / "למצב כהה") and a close ×;
  - it appears once per browser session (`sessionStorage`, in try/catch), on the first page they land on;
  - it fades out by itself after about 8 seconds unless the pointer or focus is on it; × or a switch closes it, and a switch also applies and saves the choice;
  - `role="status"`, no focus steal, 44px targets, fade and slide only on transform/opacity, none under reduced motion;
  - it must never cover the header's controls or the cart pill, and on phones it sits under the header across the width.
- **`theme-color` and the manifest:** two `theme-color` metas with `media` (light #F6F7FF, dark #020416). The manifest keeps the dark colours, since a manifest can't switch.
- **Vendor palettes:**
  - `vendorPalette`/`vendorTheme`/`vendorGlass` in `src/domain/vendors.ts` get a light variant: the same `--vendor-*` variables with light values (the tint, the border, the text accent darkened to AA on pearl);
  - logos use the original colour files in light mode (`public/vendors/*.png|svg`) and the white-ink copies (`on-dark`) only in dark. `VendorMark`'s `tone` follows the theme in CSS (both images rendered, one hidden by the theme), so no script decides.
- **Not affected:** emails (their own fixed design), the OG image, print.
- **Guard:**
  - `npm run design-lint` gets a rule: no `text-white`/`bg-white`/`bg-black` and no raw colours in TSX unless marked as theme-independent (e.g. white text on `.bg-brand`);
  - the Playwright smoke test runs once per theme (`colorScheme` in the browser context) and fails on console errors;
  - a contrast check over the token pairs runs in Vitest (a small WCAG ratio helper).

## Tasks

Three sessions, one after another. They start **after the work running now** (PP4 on the product page, CF3 and then CF4 on the catalog), because all of them touch `globals.css` and the same components.

### LM1. The foundation and the everyday pages
- Light tokens:
  - start from the pre-Nov-14 light tokens and extend them to every token `:root` has today (glass, glow, gradients, shadows, vendor variables, status fills);
  - every token pair used for text is AA (Vitest contrast test).
- The inline theme script, `data-theme`, the `ThemeToggle` with its three states, the welcome note (top left, once per session, with a switch), `theme-color` per scheme, and `color-scheme`.
- Sweep the shared utilities and components for raw colours: `card-surface`, `btn-brand`, `btn-soft`, `glass-pill`, `tile-fade`, `glow-*`, header, search panel, cart sheet and pill, toasts, sheets and dialogs, form fields, `StatusTag` tones, `HeaderMenu`, footer, skeletons.
- **Pages that must be fully right in light by the end of LM1:**
  - the catalog (`/catalog`, the filter panel, cards, list view);
  - the product page (including the hot row in its light version);
  - the cart and sending a request;
  - orders and quotes (`/orders`, `/q/[token]`);
  - account and sign-in;
  - the info pages;
  - all of `/admin`.
- The design-lint rule; Playwright in both themes.
- Update CLAUDE.md: replace "one dark system, no light/dark switch" with the two-theme rule, and add both palettes to "Design tokens".

**Done when:**
- switching at any page changes everything at once, with no flash on reload in either mode;
- the device setting is followed until the user picks;
- no text fails AA in light, and nothing is unreadable;
- those pages look finished in light at 375, 1280 and 1920 px;
- dark looks exactly as before (screenshots compared).

### LM2. Daylight vendor stores and product vendor colours
- The vendor stores in daylight (`/v/<code>`):
  - a pale wash of the vendor's palette over pearl;
  - the flagship header with the vendor's colour logo;
  - the search console, the group cards and their flyouts as frosted white glass with the vendor's border;
  - "הכי מבוקשים" with the light flame;
  - "גלו עוד".
- Product pages with one or two vendors (PP4's colours) in their light variant.
- The catalog vendor strip with colour logos in light.

**Done when:** every vendor store reads as that vendor's shop in daylight, and the vendor's colours stay recognizable and AA-readable.

### LM3. The home page in daylight
- The competition scene (`home-scene.tsx`, the home section at the end of `globals.css`) in daylight:
  - a pearl/ice sky instead of midnight;
  - the two 1690 photos with light splash masks (soft white fades instead of dark ones);
  - the paint splashes and motto recoloured for a light canvas;
  - the telemetry bar as white glass;
  - the vendor boxes as tinted frosted glass with their colour logos;
  - the category showcase.
- Keep the layout, the photos (never mirrored or altered), the parallax and the motion rules exactly as they are.

**Done when:**
- the home page in light reads as the same competition photograph by day;
- no dark patches or white-on-white text;
- 375, 1280 and 1920 px checked;
- dark unchanged.

## Progress

| Task | Status | Commit |
|---|---|---|
| LM1 Foundation and everyday pages | Not started (after PP4, CF3, CF4) | |
| LM2 Daylight vendor stores | Not started | |
| LM3 Home in daylight | Not started | |
