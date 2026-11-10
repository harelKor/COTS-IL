"use client";

import { Copy, Minus, Plus, ShoppingBag } from "lucide-react";
import { useRef, useState, useSyncExternalStore, ViewTransition } from "react";
import { choose, NONE, pick } from "@/domain/families/pick";
import { optionLabel } from "@/domain/families/sort";
import { formatIls } from "@/domain/pricing";
import { availabilityStatus, isFresh, useNow } from "./availability";
import { familyHref, productImageTransition } from "@/lib/catalog-links";
import { imageLoading, shopifyImage } from "@/lib/images";
import { addToCartNow } from "./cart-actions";
import { PriceNote } from "./price-note";
import { canEditCart, useCart } from "./cart-store";
import { Ltr } from "./ltr";
import { QtyStepper } from "./qty-stepper";
import { showToast } from "./toast";

export type ViewVariant = {
  id: string;
  sku: string | null;
  options: Record<string, string>;
  priceIls: number | null;
  available: boolean | null;
  checkedAt: string;
  supplierName: string;
  supplierCode: string;
  productUrl: string;
  image: string | null;
};

type Props = {
  family: { id: string; slug: string; title: string; images: string[]; optionKeys: string[] };
  /** Cheapest in stock first, so a settled choice picks the best offer. */
  variants: ViewVariant[];
  /** Day of the Bank of Israel rate behind the prices (YYYY-MM-DD). */
  rateDate?: string;
};

type InnerProps = Props & { initialVariantId: string | null };

const noSubscribe = () => () => {};
/** The address the picker itself last wrote, so its own changes to `?v=` do not reset it. */
let ownHref = "";
let linked: { href: string; v: string | null } = { href: "", v: null };
/** `?v=` from the address bar (a SKU, any case, or a variant id); null while prerendering. */
function linkedVariant() {
  const href = window.location.href;
  if (href !== linked.href && href !== ownHref) linked = { href, v: new URLSearchParams(window.location.search).get("v")?.trim().toLowerCase() ?? null };
  return linked.v;
}
/** Shows the chosen variant in the address bar without a navigation. */
function showInUrl(path: string) {
  window.history.replaceState(window.history.state, "", path);
  ownHref = window.location.href;
}
const noLinkedVariant = () => null;

/**
 * The family page's gallery and buy panel. The page is prerendered without a selection;
 * the variant in the link (`?v=`) is chosen in the browser, so one cached page serves them all.
 */
export function FamilyView({ family, variants, rateDate }: Props) {
  const wanted = useSyncExternalStore(noSubscribe, linkedVariant, noLinkedVariant);
  const match = wanted ? variants.find((x) => x.id === wanted || x.sku?.toLowerCase() === wanted) : undefined;
  const initialVariantId = match?.id ?? (variants.length === 1 ? variants[0].id : null);
  return <FamilyPicker key={initialVariantId ?? "none"} family={family} variants={variants} rateDate={rateDate} initialVariantId={initialVariantId} />;
}

/**
 * The family page's gallery and buy panel. Option chips (and the supplier, when
 * several sell the part) update the photo, price, SKU and URL at once; "Add"
 * puts the chosen variant in the cart without leaving the page.
 */
function FamilyPicker({ family, variants, rateDate, initialVariantId }: InnerProps) {
  const { mode, lines } = useCart();
  const now = useNow();
  const availabilityText = (v: ViewVariant) => availabilityStatus(v.available, v.checkedAt, isFresh(v.checkedAt, now));
  const manySuppliers = new Set(variants.map((v) => v.supplierCode)).size > 1;
  const keys = family.optionKeys;

  const initial = variants.find((v) => v.id === initialVariantId);
  const [choices, setChoices] = useState<Record<string, string>>(initial ? initial.options : {});
  // The supplier is a preference, not a size: once the sizes settle, the cheapest offer in
  // stock is chosen, and the supplier chips only switch between offers of that same part.
  const [supplier, setSupplier] = useState<string | null>(initial && manySuppliers ? initial.supplierName : null);
  const [qty, setQty] = useState(1);
  const [photo, setPhoto] = useState<string | null>(null);
  const mainImage = useRef<HTMLDivElement>(null);

  const picked = pick(variants, keys, choices);
  const offers = picked.chosen ? picked.candidates : [];
  const chosen = offers.find((v) => v.supplierName === supplier) ?? offers[0] ?? null;
  const cartCount = lines.reduce((n, l) => n + l.qty, 0);
  const inCart = chosen ? lines.find((l) => l.variantId === chosen.id) : undefined;
  const canAdd = canEditCart(mode);
  const shown = photo ?? chosen?.image ?? family.images[0] ?? null;
  const gallery = [...new Set([...(chosen?.image ? [chosen.image] : []), ...family.images])].slice(0, 6);
  const lowest = Math.min(...variants.flatMap((v) => (v.priceIls === null ? [] : [v.priceIls])));

  function onChip(key: string, value: string) {
    const next = choose(variants, keys, choices, key, value);
    setChoices(next);
    setPhoto(null);
    const result = pick(variants, keys, next);
    const settled = result.chosen ? (result.candidates.find((v) => v.supplierName === supplier) ?? result.candidates[0]) : null;
    showInUrl(familyHref(family.slug, settled ? (settled.sku ?? settled.id) : null));
  }

  function onSupplier(name: string) {
    setSupplier(name);
    const offer = offers.find((v) => v.supplierName === name);
    if (offer) showInUrl(familyHref(family.slug, offer.sku ?? offer.id));
  }

  function add() {
    if (!chosen) return;
    addToCartNow(
      {
        variantId: chosen.id,
        title: family.title,
        options: family.optionKeys.flatMap((k) => (chosen.options[k] ? [chosen.options[k]] : [])).join(" / "),
        sku: chosen.sku,
        image: chosen.image ?? family.images[0] ?? null,
        href: familyHref(family.slug, chosen.sku ?? chosen.id),
        supplierName: chosen.supplierName,
        unitPriceIls: chosen.priceIls,
      },
      qty,
      mainImage.current,
    );
    setQty(1);
  }

  const price = chosen?.priceIls ?? null;
  const priceText = chosen ? (price === null ? "ייבדק בהצעה" : formatIls(price)) : Number.isFinite(lowest) ? `החל מ-${formatIls(lowest)}` : "ייבדק בהצעה";
  const availability = chosen ? availabilityText(chosen) : null;
  const missing = keys.filter((k) => picked.selected[k] === undefined);
  const lineQty = inCart?.qty ?? qty;
  // A "best price" badge only when the offers' prices differ.
  const offerPrices = offers.flatMap((o) => (o.priceIls === null ? [] : [o.priceIls]));
  const cheapest = offerPrices.length > 1 && Math.min(...offerPrices) < Math.max(...offerPrices) ? Math.min(...offerPrices) : null;

  const addControls = !canAdd ? null : inCart ? (
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
      <button
        type="button"
        onClick={add}
        disabled={!chosen || price === null}
        className="flex h-11 flex-1 items-center justify-center rounded-full bg-brand px-6 font-medium text-white transition-colors hover:bg-brand-strong disabled:bg-line disabled:text-muted"
      >
        {chosen ? "הוספה לסל" : `בחרו ${optionLabel(missing[0] ?? "")}`}
      </button>
    </div>
  );

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <ViewTransition name={productImageTransition(family.id)} share="morph" default="none">
          <div ref={mainImage} className="relative aspect-square w-full overflow-hidden rounded-card bg-tile p-8 ring-1 ring-black/5">
            {shown && (
              // Hot-linked from the supplier's CDN, as agreed in the plan, so next/image is not used.
              // eslint-disable-next-line @next/next/no-img-element
              <img {...shopifyImage(shown, 560)} alt={family.title} {...imageLoading(true)} referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
            )}
            {chosen?.sku && (
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(chosen.sku!).then(() => showToast("המק״ט הועתק"))}
                aria-label={`העתקת המק״ט ${chosen.sku}`}
                className="group absolute start-2 top-2 flex min-h-11 items-center"
              >
                <span className="flex h-8 items-center gap-1.5 rounded-full bg-surface/85 px-3 text-[12px] text-foreground shadow-sm backdrop-blur transition-colors group-hover:bg-surface">
                  <Ltr className="font-mono">{chosen.sku}</Ltr>
                  <Copy size={13} strokeWidth={1.75} aria-hidden className="text-muted" />
                </span>
              </button>
            )}
          </div>
        </ViewTransition>
        {gallery.length > 1 && (
          <ul className="grid grid-cols-6 gap-2">
            {gallery.map((src, i) => (
              <li key={src}>
                <button
                  type="button"
                  onClick={() => setPhoto(src)}
                  aria-label={`תמונה ${i + 1}`}
                  aria-pressed={src === shown}
                  className={`aspect-square w-full overflow-hidden rounded-xl bg-tile p-1 ${src === shown ? "ring-2 ring-foreground" : "ring-1 ring-black/5"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img {...shopifyImage(src, 80)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-5 md:sticky md:top-[68px] md:self-start">
        <div>
          <p className="text-caption text-muted">
            <Ltr>{[...new Set(variants.map((v) => v.supplierName))].join(", ")}</Ltr>
          </p>
          <h1 dir="ltr" className="text-start text-title font-semibold text-balance">
            {family.title}
          </h1>
        </div>

        {keys.map((key) => {
          const value = picked.selected[key];
          return (
            <section key={key} className="flex flex-col gap-3 rounded-2xl border border-line/80 bg-surface p-4">
              <header className="flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] text-muted">{optionLabel(key)}</h2>
                {value === undefined ? (
                  <span className="text-[15px] text-brand">בחרו אפשרות</span>
                ) : (
                  <span className="min-w-0 truncate text-[15px] font-semibold">{value === NONE ? "ללא" : <Ltr>{value}</Ltr>}</span>
                )}
              </header>
              <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
                {picked.chips[key].map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    aria-pressed={chip.selected}
                    onClick={() => onChip(key, chip.value)}
                    className={`min-h-11 rounded-full px-4 text-[15px] transition-[color,background-color,scale] duration-150 active:scale-95 ${
                      chip.selected
                        ? "bg-foreground font-medium text-background shadow-sm"
                        : chip.enabled
                          ? "bg-subtle/70 hover:bg-subtle"
                          : "bg-subtle/70 line-through opacity-35 hover:opacity-60"
                    }`}
                  >
                    {chip.value === NONE ? "ללא" : <Ltr>{chip.value}</Ltr>}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

        {manySuppliers && offers.length > 1 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] text-muted">ספק</h2>
            <div className="grid grid-cols-2 gap-2">
              {offers.map((offer) => {
                const on = offer === chosen;
                const status = availabilityText(offer);
                return (
                  <button
                    key={offer.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => onSupplier(offer.supplierName)}
                    className={`flex min-h-11 flex-col items-start gap-1.5 rounded-2xl border p-3 text-start transition-[border-color,box-shadow] duration-150 ${
                      on ? "border-foreground shadow-[inset_0_0_0_1px_var(--foreground)]" : "border-line/80 bg-surface hover:border-muted"
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <Ltr className="truncate font-semibold">{offer.supplierName}</Ltr>
                      {cheapest !== null && offer.priceIls === cheapest && (
                        <span className="shrink-0 rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">המשתלם ביותר</span>
                      )}
                    </span>
                    <span className="text-[17px] font-semibold">{offer.priceIls === null ? <span className="text-caption font-normal text-muted">ייבדק בהצעה</span> : formatIls(offer.priceIls)}</span>
                    <span className="flex items-center gap-1.5 text-caption text-muted">
                      <span className={`size-2 rounded-full ${status.dot}`} aria-hidden />
                      {status.short}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section aria-label="רכישה" className="card-surface flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-title font-semibold">{priceText}</span>
            {price !== null && lineQty > 1 && <span className="text-[15px] text-muted">סה״כ: {formatIls(price * lineQty)}</span>}
          </div>
          {availability && (
            <p className={`flex items-center gap-2 text-caption ${availability.tone}`}>
              <span className={`size-2 shrink-0 rounded-full ${availability.dot}`} aria-hidden />
              {availability.text}
            </p>
          )}
          <div className="hidden md:block">{addControls}</div>
          <div className="border-t border-line pt-3">
            <PriceNote rateDate={rateDate} />
          </div>
        </section>

        {chosen && (
          <a href={chosen.productUrl} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center self-start text-caption text-brand hover:underline">
            לעמוד המוצר באתר <Ltr className="ms-1">{chosen.supplierName}</Ltr>
          </a>
        )}
      </div>

      {canAdd && (
        // On phones the buy controls stay under the thumb; the cart pill moves up out of the way.
        <div data-buy-bar className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-line bg-glass px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px] font-semibold">{priceText}</span>
            {cartCount > 0 && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("cart:open"))}
                className="flex h-9 items-center gap-2 rounded-full bg-foreground px-3 text-caption font-medium text-background"
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
