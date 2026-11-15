"use client";

import Link from "next/link";
import { Copy, ExternalLink, Minus, Plus, ShoppingBag, Table2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { choiceQuery, choicesFrom, findLinked, variantParam } from "@/domain/families/link";
import { changedKeys, choose, clashesWith, linkedKeys, linkedValue, NONE, pick, settle, withChoice } from "@/domain/families/pick";
import { groupPreviews, priceRange, supplierShare, type Preview } from "@/domain/families/preview";
import { compareDisplay, isLargeGroup, optionDisplay, orderGroups, type OptionDisplay } from "@/domain/families/option-label";
import { optionLabel } from "@/domain/families/sort";
import { arrivalShort, arrivalText } from "@/domain/lead-time";
import { offerReason, rankOffers } from "@/domain/offers";
import { dedupePhotos, followPhoto, ownPhoto } from "@/domain/gallery";
import { formatIls } from "@/domain/pricing";
import { useSiteFacts } from "./site-facts";
import { RequestPart } from "./zero-results";
import { availabilityStatus, isFresh, useNow } from "./availability";
import { familyHref, productImageTransition } from "@/lib/catalog-links";
import { addToCartNow } from "./cart-actions";
import { PriceNote } from "./price-note";
import { ProductGallery } from "./product-gallery";
import { publishChoice } from "./spec-table";
import { canEditCart, useCart } from "./cart-store";
import { vendorHref } from "@/domain/vendors";
import { Ltr } from "./ltr";
import { OptionCombobox } from "./option-combobox";
import { QtyStepper } from "./qty-stepper";
import { showToast } from "./toast";

export type ViewVariant = {
  id: string;
  sku: string | null;
  options: Record<string, string>;
  priceIls: number | null;
  /** The multiplier behind priceIls, for "איך נקבע המחיר?". */
  markup: number;
  available: boolean | null;
  /** Orderable, but the supplier ships it later (בהזמנה מראש), with its ETA words if any. */
  shipsLater: boolean;
  shipsLaterEta: string | null;
  checkedAt: string;
  supplierName: string;
  supplierCode: string;
  productUrl: string;
  image: string | null;
  /** This variant's own specs: the page's spec table shows them as the choice settles them. */
  specs: { key: string; value: string }[];
};

type Props = {
  family: { id: string; slug: string; title: string; images: string[]; optionKeys: string[] };
  /** Cheapest in stock first, so a settled choice picks the best offer. */
  variants: ViewVariant[];
  /** Day of the Bank of Israel rate behind the prices (YYYY-MM-DD). */
  rateDate?: string;
  /** Rows in the page's "כל האפשרויות" table, when the options area should link to it. */
  tableRows?: number;
  /** This part's own CAD and guide, for the short row of links under the price note. */
  docs?: { cad: string | null; guide: string | null };
};

type InnerProps = Props & { initialChoices: Record<string, string>; initialSupplier: string | null };

const noSubscribe = () => () => {};
type Linked = { href: string; v: string | null; vendor: string | null; query: string };
/**
 * Addresses the picker itself wrote, so its own changes to the URL do not reset it: the one
 * it's going to, and the one still showing until the router gets there (a render in between
 * would otherwise read the previous choice as a new link and switch back to it).
 */
let ownHrefs = new Set<string>();
let linked: Linked = { href: "", v: null, vendor: null, query: "" };
const unlinked: Linked = { href: "", v: null, vendor: null, query: "" };
/**
 * `?v=` (a SKU, any case, or a variant id), `?vendor=` (a supplier code, from a vendor's
 * store) and a choice still being made (`?width=15mm`) from the address bar, read together
 * and kept while the picker rewrites the URL, so switching supplier doesn't reset the choice.
 * Nothing while prerendering.
 */
function linkedOffer() {
  const href = window.location.href;
  if (href !== linked.href && !ownHrefs.has(href)) {
    const params = new URLSearchParams(window.location.search);
    linked = { href, v: params.get("v"), vendor: params.get("vendor"), query: window.location.search };
  }
  return linked;
}
/** The address the router is about to show, marked as the picker's own so it doesn't reset it. */
function claimUrl(path: string) {
  ownHrefs = new Set([window.location.href, new URL(path, window.location.href).href]);
}
const noLinkedOffer = () => unlinked;

/** Smooth scrolling, unless the visitor asked for less motion. */
const scrollBehavior = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/** "₪28", or "מ-₪28" while the tap leaves several prices. */
const previewText = (p: Preview | null) => (p ? (p.exact ? formatIls(p.price) : `מ-${formatIls(p.price)}`) : null);

/**
 * The family page's gallery and buy panel. The page is prerendered without a selection;
 * the variant in the link (`?v=`, settled by `?vendor=` when two vendors share a SKU), or the
 * choice so far (`?width=15mm`), is chosen in the browser, so one cached page serves them all.
 */
export function FamilyView({ family, variants, rateDate, tableRows, docs }: Props) {
  const { v: wanted, vendor, query } = useSyncExternalStore(noSubscribe, linkedOffer, noLinkedOffer);
  const match = findLinked(variants, wanted, vendor);
  const fromVendor = vendor ? variants.filter((x) => x.supplierCode === vendor) : [];
  const initial = match ?? (variants.length === 1 ? variants[0] : fromVendor.length === 1 ? fromVendor[0] : undefined);
  const initialSupplier = match ? match.supplierName : (fromVendor[0]?.supplierName ?? null);
  const fromQuery = initial ? "" : choiceQuery(choicesFrom(new URLSearchParams(query), family.optionKeys), family.optionKeys);
  return (
    <FamilyPicker
      key={`${initial?.id ?? "none"}:${initialSupplier ?? ""}:${fromQuery}`}
      family={family}
      variants={variants}
      rateDate={rateDate}
      tableRows={tableRows}
      docs={docs}
      initialChoices={initial ? initial.options : choicesFrom(new URLSearchParams(fromQuery), family.optionKeys)}
      initialSupplier={initial ? initial.supplierName : initialSupplier}
    />
  );
}

type Clash = { key: string; value: string; items: { title: string; label: string }[]; cleared: boolean };

/**
 * The family page's gallery and buy panel. Option chips (and the supplier, when
 * several sell the part) update the photo, price, SKU and URL at once; "Add"
 * puts the chosen variant in the cart without leaving the page.
 */
function FamilyPicker({ family, variants, rateDate, tableRows, docs, initialChoices, initialSupplier }: InnerProps) {
  const { mode, lines } = useCart();
  const { leadTimes } = useSiteFacts();
  const now = useNow();
  const availabilityText = (v: ViewVariant) => availabilityStatus(v.available, v.checkedAt, isFresh(v.checkedAt, now), { shipsLater: v.shipsLater, eta: v.shipsLaterEta }, now);
  const vendors = useMemo(() => [...new Map(variants.map((v) => [v.supplierCode, v.supplierName])).entries()], [variants]);
  const manySuppliers = vendors.length > 1;
  const keys = family.optionKeys;
  // Keys that always go together (a bearing's ID and OD) get one picker, not two that switch each other.
  const groups = useMemo(() => linkedKeys(variants, keys), [variants, keys]);

  // A linked group is chosen by its first key (the others follow it), so a tap never clashes with its own pair.
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initialChoices).filter(([k]) => !groups.some((g) => g.indexOf(k) > 0))),
  );
  // The supplier is a preference, not a size: once the sizes settle, the cheapest offer in
  // stock is chosen, and the supplier cards only switch between offers of that same part.
  const [supplier, setSupplier] = useState<string | null>(manySuppliers ? initialSupplier : null);
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState<string | null>(null);
  /** Option groups to highlight for a moment: changed by a tap elsewhere. */
  const [flash, setFlash] = useState<string[]>([]);
  /** The group "בחרו …" pointed at: outlined, with a line under its title, until it's chosen. */
  const [missing, setMissing] = useState<string | null>(null);
  /** What the last tap cleared because it didn't go with it, said once under that group. */
  const [clash, setClash] = useState<Clash | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mainImage = useRef<HTMLDivElement>(null);
  const buyBox = useRef<HTMLElement>(null);
  const [buyBoxInView, setBuyBoxInView] = useState(true);
  // Next keeps earlier pages in the DOM (hidden), so ids must be unique to this one.
  const uid = useId();
  const groupId = (key: string) => `${uid}-option-${key}`;
  const legendId = (key: string) => `${uid}-legend-${key}`;
  const router = useRouter();

  /** The offer a settled choice shows: the supplier asked for, else the best (in stock, then price). */
  const offerFor = (candidates: ViewVariant[]) => candidates.find((v) => v.supplierName === supplier) ?? rankOffers(candidates, leadTimes)[0];

  const picked = pick(variants, keys, choices);
  // The spec table lower on the page shows what this choice leaves (a picked bore, the teeth still open).
  useEffect(() => publishChoice(family.id, picked.candidates));
  // Best first (in stock, then price, then the vendor's lead time), so the first is the one to recommend.
  const offers = picked.chosen ? rankOffers(picked.candidates, leadTimes) : [];
  const chosen = picked.chosen ? (offerFor(picked.candidates) ?? null) : null;
  const cartCount = lines.reduce((n, l) => n + l.qty, 0);
  const inCart = chosen ? lines.find((l) => l.variantId === chosen.id) : undefined;
  const canAdd = canEditCart(mode);
  // The family's photos (once each, a large one first: the server ordered them), and the chosen
  // variant's own photo at the end when the family doesn't have it. Their order never changes.
  const own = chosen ? ownPhoto(chosen, variants) : null;
  const gallery = dedupePhotos([...family.images, ...(own ? [own] : [])]).slice(0, 12);
  // The photo follows the choice (its own photo, its SKU, its colour) until a thumbnail is tapped.
  const followed = Object.keys(choices).length > 0 || chosen ? followPhoto(gallery, picked.candidates, chosen, variants, picked.selected) : null;
  const shown = (photo && gallery.includes(photo) ? photo : null) ?? followed ?? gallery[0] ?? null;

  // Each group as the page shows it: values in reading order (numbers as numbers), their labels,
  // the price a tap on each leads to, and chips or one searchable field. Small groups come first.
  const views = orderGroups(
    groups.map((group) => {
      const key = group[0];
      const display = (value: string): OptionDisplay =>
        value === NONE ? { label: "ללא", sub: null } : group.length > 1 ? { label: linkedValue(variants, group, value), sub: null } : optionDisplay(value);
      const chips = [...picked.chips[key]].sort((a, b) => (a.value === NONE ? -1 : b.value === NONE ? 1 : compareDisplay(a.value, b.value)));
      const previews = groupPreviews(variants, keys, choices, key, chips.map((c) => c.value), offerFor);
      const large = isLargeGroup(chips.map((c) => display(c.value).label));
      return { group, key, title: group.map(optionLabel).join(" × "), display, chips, previews, large };
    }),
    (v) => v.large,
  );
  const viewOf = (k: string) => views.find((v) => v.group.includes(k))!;
  const missingView = views.find((v) => v.group.some((k) => picked.selected[k] === undefined));

  /** "לא זמין עם 1 inch ו-35A": the choices a value doesn't go with. */
  function clashReason(key: string, value: string) {
    const with_ = [...new Set(clashesWith(variants, picked.selected, key, value).map((k) => viewOf(k)))].filter((v) => !v.group.includes(key));
    return with_.length ? `לא זמין עם ${with_.map((v) => v.display(picked.selected[v.key]).label).join(" ו-")}` : "לא זמין עם הבחירה הנוכחית";
  }

  // On phones the buy bar shows only while the real buy box is off screen.
  useEffect(() => {
    const box = buyBox.current;
    if (!box) return;
    const io = new IntersectionObserver(([entry]) => setBuyBoxInView(entry.isIntersecting), { rootMargin: "0px 0px -64px 0px" });
    io.observe(box);
    // A page Next keeps hidden after leaving it must not keep its bar "shown" (the cart pill hides for it).
    return () => {
      io.disconnect();
      setBuyBoxInView(true);
    };
  }, []);

  function highlight(groupKeys: string[]) {
    clearTimeout(flashTimer.current);
    setFlash(groupKeys);
    if (groupKeys.length) flashTimer.current = setTimeout(() => setFlash([]), 1600);
  }

  /** The URL follows the chosen variant (its id when another offer shares its SKU); once one is settled the server's suggestions follow it too. */
  function follow(settled: ViewVariant) {
    const path = familyHref(family.slug, variantParam(settled, variants));
    claimUrl(path);
    router.replace(path, { scroll: false });
  }

  /** A choice still being made goes in the query (`?width=15mm`), replacing the entry, so Back leaves the page. */
  function remember(next: Record<string, string>) {
    const q = choiceQuery(next, keys);
    const path = `${familyHref(family.slug)}${q ? `?${q}` : ""}`;
    claimUrl(path);
    // Leaving a settled part: the router, so the suggestions stop following it.
    if (chosen) router.replace(path, { scroll: false });
    else window.history.replaceState(null, "", path);
  }

  /** A chip (a tap on the chosen one clears it) or a row of the list (`toggle` off: it stays). */
  function onChip(key: string, value: string, toggle = true) {
    const next = toggle ? choose(variants, keys, choices, key, value) : withChoice(variants, choices, key, value);
    setChoices(next);
    setPhoto(null);
    const result = settle(variants, keys, next);
    // A tap that clashed with another choice changed it: say which, instead of switching it silently.
    const changed = changedKeys(picked.selected, result.selected, key).filter((k) => choices[k] !== undefined);
    const hit = views.filter((v) => !v.group.includes(key) && v.group.some((k) => changed.includes(k)));
    highlight(hit.map((v) => v.key));
    const tapped = viewOf(key);
    setClash(
      hit.length
        ? {
            key: tapped.key,
            value,
            items: hit.map((v) => ({ title: v.title, label: v.display(picked.selected[v.key]).label })),
            cleared: hit.every((v) => result.selected[v.key] === undefined),
          }
        : null,
    );
    const settled = result.chosen ? offerFor(result.candidates) : null;
    if (settled) {
      if (settled.id !== chosen?.id) follow(settled);
    } else remember(next);
  }

  function onSupplier(name: string) {
    setSupplier(name);
    const offer = offers.find((v) => v.supplierName === name);
    if (offer) follow(offer);
  }

  /** "בחרו …" before the choice is complete: scroll to the first missing option, outline it and say what's missing. */
  function toMissing() {
    if (!missingView) return;
    const el = document.getElementById(groupId(missingView.key));
    el?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    el?.querySelector<HTMLElement>("button, input")?.focus({ preventScroll: true });
    setMissing(missingView.key);
  }

  /** "הצגה כטבלה": opens the page's table of every option and scrolls to it. */
  function toTable(e: React.MouseEvent<HTMLElement>) {
    const table = e.currentTarget.closest("article")?.querySelector<HTMLDetailsElement>("details[data-options-table]");
    if (!table) return;
    table.open = true;
    table.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    table.querySelector<HTMLElement>("summary")?.focus({ preventScroll: true });
  }

  function add() {
    if (!chosen) return;
    addToCartNow(
      {
        variantId: chosen.id,
        title: family.title,
        options: family.optionKeys.flatMap((k) => (chosen.options[k] ? [chosen.options[k]] : [])).join(" / "),
        sku: chosen.sku,
        image: followed ?? chosen.image ?? family.images[0] ?? null,
        href: familyHref(family.slug, variantParam(chosen, variants)),
        supplierName: chosen.supplierName,
        supplierCode: chosen.supplierCode,
        unitPriceIls: chosen.priceIls,
        available: chosen.available,
        shipsLater: chosen.shipsLater,
        shipsLaterEta: chosen.shipsLaterEta,
        checkedAt: chosen.checkedAt,
      },
      qty,
      mainImage.current,
    );
    setQty(1);
    showToast("נוסף לסל", "default", { label: "לסל", run: () => window.dispatchEvent(new Event("cart:open")) });
  }

  const price = chosen?.priceIls ?? null;
  // Before the choice settles, the range of what's left ("₪28 – ₪47"); then the part's own price.
  const range = chosen ? null : priceRange(picked.candidates);
  const priceText = chosen
    ? price === null
      ? "ייבדק בהצעה"
      : formatIls(price)
    : range
      ? range.min === range.max
        ? formatIls(range.min)
        : `${formatIls(range.min)} – ${formatIls(range.max)}`
      : "ייבדק בהצעה";
  // While choosing, what's left: all of it in stock, some of it, or the best one's status.
  const best = chosen ?? rankOffers(picked.candidates, leadTimes)[0] ?? null;
  const bestStatus = best ? availabilityText(best) : null;
  // The vendor's page for the buy box: the chosen part's, or before a choice the one page every size left is on (a WCP belt has a page per size).
  const vendorPage = chosen ?? (best && picked.candidates.every((v) => v.supplierCode !== best.supplierCode || v.productUrl === best.productUrl) ? best : null);
  const availability =
    chosen || !bestStatus
      ? bestStatus
      : bestStatus.short === "זמין" && !picked.candidates.every((v) => availabilityText(v).short === "זמין")
        ? { ...bestStatus, text: "חלק מהאפשרויות זמינות אצל הספק" }
        : bestStatus;
  const missingLabel = missingView?.title ?? "";
  const arrival = chosen ? arrivalText(leadTimes[chosen.supplierCode], chosen.shipsLater) : null;
  const unpriced = chosen !== null && price === null;
  const lineQty = inCart?.qty ?? qty;
  // Why the first offer is recommended ("במלאי", "זול יותר", "מגיע מהר יותר"), only when something sets it apart.
  const reason = offers.length > 1 ? offerReason(offers[0], offers, leadTimes) : null;
  const tie = offers.length > 1 && offers.every((o) => o.priceIls === offers[0].priceIls);
  const supplierNote = !chosen
    ? "המחיר אצל כל ספק לפי הבחירה עד עכשיו"
    : chosen === offers[0] && reason
      ? `נבחר אוטומטית: ${reason === "במלאי" ? "זמין במלאי" : reason}`
      : chosen === offers[0] && tie
        ? "אותו מחיר אצל כל הספקים"
        : "";

  const addControls =
    !canAdd || unpriced ? null : inCart ? (
      <div className="flex items-center gap-3">
        <QtyStepper variantId={inCart.variantId} qty={inCart.qty} label={family.title} />
        <span className="text-caption text-muted">בסל</span>
      </div>
    ) : (
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-full bg-subtle" role="group" aria-label="כמות">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="הפחתה" className="flex size-11 items-center justify-center rounded-full disabled:opacity-30">
            <Minus size={16} strokeWidth={2} aria-hidden />
          </button>
          <span className="min-w-6 text-center tabular-nums">{qty}</span>
          <button type="button" onClick={() => setQty((q) => Math.min(9999, q + 1))} aria-label="הוספה" className="flex size-11 items-center justify-center rounded-full">
            <Plus size={16} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {chosen ? (
          <button type="button" onClick={add} className="btn-brand flex h-11 flex-1 items-center justify-center rounded-full px-6 font-medium">
            הוספה לסל
          </button>
        ) : (
          // Not Add yet: a tinted outline that takes the visitor to what's missing.
          <button
            type="button"
            onClick={toMissing}
            aria-describedby={missingView && missing === missingView.key ? `${groupId(missingView.key)}-error` : undefined}
            className="flex h-11 min-w-0 flex-1 items-center justify-center truncate rounded-full border border-brand/70 bg-brand-soft/40 px-6 font-medium text-brand-strong transition-colors duration-150 hover:bg-brand-soft"
          >
            בחרו {missingLabel}
          </button>
        )}
      </div>
    );

  return (
    // One DOM order for both layouts: on phones the name comes first, then the photos, then the
    // options; from md the photos take the first column (sticky under the header) beside both.
    <div className="grid gap-5 md:grid-cols-2 md:grid-rows-[auto_1fr] md:gap-x-8">
      <div className="min-w-0 md:col-start-2 md:row-start-1">
        <p className="text-caption text-muted">
          נמכר אצל{" "}
          {vendors.map(([code, name], i) => (
            <span key={code}>
              {i > 0 && ", "}
              <Link href={vendorHref(code)} className="inline-flex min-h-11 items-center font-semibold text-brand hover:underline">
                <Ltr>{name}</Ltr>
              </Link>
            </span>
          ))}
          {chosen?.sku && (
            <>
              , מק״ט <Ltr className="font-mono text-foreground">{chosen.sku}</Ltr>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(chosen.sku!).then(() => showToast("המק״ט הועתק"))}
                aria-label={`העתקת המק״ט ${chosen.sku}`}
                className="-my-2 ms-0.5 inline-flex size-11 items-center justify-center rounded-full align-middle text-muted hover:bg-subtle hover:text-foreground"
              >
                <Copy size={14} strokeWidth={1.75} aria-hidden />
              </button>
            </>
          )}
        </p>
        <h1 dir="ltr" className="text-start text-title font-semibold text-balance">
          {family.title}
        </h1>
      </div>

      <div className="flex min-w-0 flex-col gap-2 md:sticky md:top-[68px] md:col-start-1 md:row-span-2 md:row-start-1 md:self-start">
        <ProductGallery title={family.title} photos={gallery} shown={shown} onShow={setPhoto} transitionName={productImageTransition(family.id)} mainRef={mainImage} />
      </div>

      <div className="flex min-w-0 flex-col gap-4 md:col-start-2 md:row-start-2">
        {views.map((view) => {
          const { key, title, display, chips, previews, large } = view;
          const value = picked.selected[key];
          const lit = flash.includes(key);
          const asked = missing === key && value === undefined;
          const note = clash?.key === key ? clash : null;
          return (
            <fieldset
              key={key}
              id={groupId(key)}
              className={`flex min-w-0 scroll-mt-20 flex-col gap-3 rounded-2xl border bg-surface p-4 transition-[border-color,box-shadow] duration-300 ${
                asked ? "border-brand shadow-[0_0_0_3px_var(--brand-soft)]" : lit ? "border-brand shadow-[0_0_0_3px_var(--brand-soft)]" : "border-line/80"
              }`}
            >
              {/* Floated, the legend lays out as a row of the group like any other. */}
              <legend id={legendId(key)} className="float-start flex w-full items-baseline justify-between gap-3">
                <span className="text-callout text-muted">{title}</span>
                {value === undefined ? (
                  <span className="text-callout text-brand" aria-hidden>
                    בחרו אפשרות
                  </span>
                ) : (
                  <span className="min-w-0 truncate text-callout font-semibold">
                    {lit && <span className="me-2 text-caption font-normal text-brand">עודכן</span>}
                    <Ltr>{display(value).label}</Ltr>
                  </span>
                )}
              </legend>
              {asked && (
                <p id={`${groupId(key)}-error`} className="-mt-1 text-caption font-medium text-danger">
                  בחרו {title}
                </p>
              )}
              {large ? (
                <OptionCombobox
                  title={title}
                  labelledBy={legendId(key)}
                  onPick={(v) => onChip(key, v, false)}
                  options={chips.map((chip, i) => ({
                    value: chip.value,
                    label: display(chip.value).label,
                    sub: display(chip.value).sub,
                    price: previewText(previews[i]),
                    clash: chip.enabled ? null : clashReason(key, chip.value),
                    selected: chip.selected,
                  }))}
                />
              ) : (
                // Long groups wrap: the page scrolls, never a box inside it.
                <div className="flex flex-wrap gap-2">
                  {chips.map((chip, i) => {
                    const { label, sub } = display(chip.value);
                    const why = chip.enabled ? null : clashReason(key, chip.value);
                    const tag = previewText(previews[i]);
                    return (
                      <button
                        key={chip.value}
                        type="button"
                        aria-pressed={chip.selected}
                        aria-disabled={why ? true : undefined}
                        title={why ?? undefined}
                        onClick={() => onChip(key, chip.value)}
                        className={`flex min-h-11 flex-col items-center justify-center rounded-full px-4 text-callout leading-tight transition-[color,background-color,scale] duration-150 active:scale-95 ${
                          chip.selected
                            ? "bg-brand font-medium text-white shadow-sm"
                            : why
                              ? "bg-subtle/40 text-muted hover:bg-subtle/70 hover:text-foreground"
                              : "bg-subtle/70 hover:bg-subtle"
                        }`}
                      >
                        <Ltr className={why ? "line-through decoration-1" : undefined}>{label}</Ltr>
                        {sub && <span className={`text-caption ${chip.selected ? "text-white/75" : "text-muted"}`}>{sub}</span>}
                        {tag && <span className={`text-caption ${chip.selected ? "text-white/75" : "text-muted"}`}>{tag}</span>}
                        {why && <span className="sr-only">, {why}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {note && (
                <p role="status" className="text-caption text-muted">
                  {note.items.map((item, i) => (
                    <span key={item.title}>
                      {i > 0 && ", "}
                      {item.title} <Ltr>{item.label}</Ltr>
                    </span>
                  ))}{" "}
                  {note.items.length > 1 ? "לא מתאימים" : "לא מתאים"} ל-<Ltr>{display(note.value).label}</Ltr>, ולכן{" "}
                  {note.cleared ? (note.items.length > 1 ? "בוטלו" : "בוטל") : note.items.length > 1 ? "הוחלפו" : "הוחלף"}.
                </p>
              )}
            </fieldset>
          );
        })}

        {tableRows !== undefined && (
          <button type="button" onClick={toTable} className="-my-2 flex min-h-11 items-center gap-2 self-start text-callout text-brand hover:text-brand-strong hover:underline">
            <Table2 size={18} strokeWidth={1.75} aria-hidden />
            הצגה כטבלה ({tableRows.toLocaleString("he-IL")})
          </button>
        )}

        <section ref={buyBox} aria-label="רכישה" className="card-surface flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-title font-semibold" aria-live="polite">
              {priceText}
            </span>
            {price !== null && lineQty > 1 && <span className="text-callout text-muted">סה״כ: {formatIls(price * lineQty)}</span>}
          </div>
          {availability && (
            <p className={`-mt-2 flex items-center gap-2 text-caption ${availability.tone}`}>
              <span className={`size-2 shrink-0 rounded-full ${availability.dot}`} aria-hidden />
              {availability.text}
            </p>
          )}

          {/* One slot on every part two vendors sell, at its full size from the start, so nothing moves when the choice settles. */}
          {manySuppliers && (
            <div className="flex flex-col gap-2">
              <h3 id={`${uid}-suppliers`} className="text-callout text-muted">
                ספק
              </h3>
              <div role="group" aria-labelledby={`${uid}-suppliers`} className="grid grid-cols-2 gap-2">
                {vendors.map(([code, name]) => {
                  const offer = chosen ? offers.find((o) => o.supplierCode === code) : undefined;
                  const share = chosen ? null : supplierShare(picked.candidates, code);
                  const sells = chosen ? offer !== undefined : share !== null;
                  const top = chosen ? offer : rankOffers(picked.candidates.filter((v) => v.supplierCode === code), leadTimes)[0];
                  const status = top ? availabilityText(top) : null;
                  const on = chosen ? offer === chosen : supplier === name;
                  const eta = arrivalShort(leadTimes[code]);
                  const priceLine = offer
                    ? offer.priceIls === null
                      ? null
                      : formatIls(offer.priceIls)
                    : share?.range
                      ? share.range.min === share.range.max
                        ? formatIls(share.range.min)
                        : `מ-${formatIls(share.range.min)}`
                      : null;
                  const body = (
                    <>
                      <Ltr className="font-semibold break-words">{name}</Ltr>
                      <span className="flex min-h-6 items-center text-body font-semibold">
                        {!sells ? <span className="text-caption font-normal text-muted">לא נמכר בבחירה הזו</span> : priceLine ?? <span className="text-caption font-normal text-muted">ייבדק בהצעה</span>}
                      </span>
                      <span className="flex min-h-5 items-center gap-1.5 text-caption text-muted">
                        {status && (
                          <>
                            <span className={`size-2 rounded-full ${status.dot}`} aria-hidden />
                            {status.short}
                          </>
                        )}
                      </span>
                      {eta && <span className="text-caption text-muted">{eta}</span>}
                    </>
                  );
                  const box = "flex min-h-11 flex-col items-start gap-1 rounded-2xl border p-3 text-start transition-[border-color,box-shadow,background-color] duration-150";
                  return sells ? (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={on}
                      onClick={() => onSupplier(name)}
                      className={`${box} ${on ? "border-brand bg-brand-soft/40 shadow-[inset_0_0_0_1px_var(--brand)]" : "border-line/80 bg-surface hover:border-muted"}`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div key={code} className={`${box} border-line/60 bg-surface/60 opacity-70`}>
                      {body}
                    </div>
                  );
                })}
              </div>
              <p className="min-h-5 text-caption text-muted">{supplierNote}</p>
            </div>
          )}

          {addControls}
          {chosen?.available === false && !unpriced && <p className="-mt-2 text-caption text-muted">לא זמין כרגע אצל הספק, נבדוק עבורכם בהצעה. אפשר להוסיף לסל.</p>}
          {arrival && !unpriced && <p className="-mt-2 text-caption text-muted">{arrival}</p>}
          {unpriced && chosen && (
            <div className="flex flex-col gap-2">
              <p className="text-caption text-muted">לא ניתן להזמין כרגע דרך האתר: אין לנו מחיר לחלק הזה. שלחו בקשה ונבדוק אותו עבורכם.</p>
              <RequestPart
                key={chosen.id}
                q={family.title}
                url={chosen.productUrl}
                note={[family.title, chosen.sku, ...keys.flatMap((k) => (chosen.options[k] ? [chosen.options[k]] : []))].filter(Boolean).join(", ")}
                label="בקשה בכל זאת"
                hint="נשלח לנו את הקישור לחלק אצל הספק. אפשר להוסיף כמות או הערה."
                back={familyHref(family.slug, variantParam(chosen, variants))}
              />
            </div>
          )}
          <div className="border-t border-line pt-3">
            <PriceNote rateDate={rateDate} markup={chosen?.markup} />
            {/* CAD, the guide and the vendor's page, right here: often why a team opens the part. Only the ones that exist. */}
            {(docs?.cad || docs?.guide || vendorPage) && (
              <ul aria-label="קבצים וקישורים" className="flex flex-wrap gap-x-5 text-caption">
                {docs?.cad && (
                  <li>
                    <a href={docs.cad} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-brand hover:underline">
                      <Ltr>CAD</Ltr>
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  </li>
                )}
                {docs?.guide && (
                  <li>
                    <a href={docs.guide} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-brand hover:underline">
                      מדריך
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  </li>
                )}
                {vendorPage && (
                  <li>
                    <a href={vendorPage.productUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-brand hover:underline">
                      <span>
                        דף המוצר אצל <Ltr>{vendorPage.supplierName}</Ltr>
                      </span>
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  </li>
                )}
              </ul>
            )}
          </div>
        </section>

      </div>

      {canAdd && (
        // On phones the buy controls stay under the thumb once the buy box is off screen; the cart pill moves out of the way.
        <div
          data-buy-bar
          data-shown={!buyBoxInView || undefined}
          aria-hidden={buyBoxInView || undefined}
          inert={buyBoxInView}
          className={`fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-line bg-glass px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl transition-[translate,opacity] duration-300 ease-out md:hidden ${
            buyBoxInView ? "pointer-events-none translate-y-full opacity-0" : "translate-y-0 opacity-100"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-callout font-semibold">{priceText}</span>
            {cartCount > 0 && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("cart:open"))}
                className="flex h-11 items-center gap-2 rounded-full bg-brand-soft px-4 text-caption font-semibold text-brand-strong"
              >
                <ShoppingBag size={16} strokeWidth={1.75} aria-hidden />
                סל <span className="rounded-full bg-background/20 px-1.5 tabular-nums">{cartCount}</span>
              </button>
            )}
          </div>
          {addControls}
        </div>
      )}
    </div>
  );
}
