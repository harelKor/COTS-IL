"use client";

import { Copy, Minus, Plus, ShoppingBag } from "lucide-react";
import { useRef, useState, ViewTransition } from "react";
import { choose, NONE, pick } from "@/domain/families/pick";
import { optionLabel } from "@/domain/families/sort";
import { formatIls } from "@/domain/pricing";
import { isAvailabilityFresh } from "@/domain/reports";
import { familyHref, productImageTransition } from "@/lib/catalog-links";
import { addToCartNow } from "./cart-actions";
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
  initialVariantId: string | null;
};

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Asia/Jerusalem" });

function sized(src: string | null | undefined, width: number) {
  if (!src) return null;
  return src.startsWith("https://cdn.shopify.com/") ? `${src}${src.includes("?") ? "&" : "?"}width=${width}` : src;
}

function availabilityText(v: ViewVariant) {
  const checked = new Date(v.checkedAt);
  if (v.available === null || !isAvailabilityFresh(checked, new Date())) return { text: "זמינות לא אומתה", tone: "text-muted" };
  const date = dayMonth.format(checked);
  return v.available
    ? { text: `זמין אצל הספק (נבדק ${date})`, tone: "text-success" }
    : { text: `לא זמין כרגע (נבדק ${date})`, tone: "text-warning" };
}

/**
 * The family page's gallery and buy panel. Option chips (and the supplier, when
 * several sell the part) update the photo, price, SKU and URL at once; "Add"
 * puts the chosen variant in the cart without leaving the page.
 */
export function FamilyView({ family, variants, initialVariantId }: Props) {
  const { mode, lines } = useCart();
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
    window.history.replaceState(window.history.state, "", familyHref(family.slug, settled ? (settled.sku ?? settled.id) : null));
  }

  function onSupplier(name: string) {
    setSupplier(name);
    const offer = offers.find((v) => v.supplierName === name);
    if (offer) window.history.replaceState(window.history.state, "", familyHref(family.slug, offer.sku ?? offer.id));
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
          <div ref={mainImage} className="aspect-square w-full overflow-hidden rounded-card bg-tile p-6">
            {shown && (
              // Hot-linked from the supplier's CDN, as agreed in the plan, so next/image is not used.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sized(shown, 900)!} alt={family.title} referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
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
                  className={`aspect-square w-full overflow-hidden rounded-xl bg-tile p-1 ${src === shown ? "ring-2 ring-foreground" : ""}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sized(src, 160)!} alt="" referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-5 md:sticky md:top-[68px] md:self-start">
        <div>
          <p className="text-caption text-muted">
            <Ltr>{[...new Set(variants.map((v) => v.supplierName))].join(" · ")}</Ltr>
          </p>
          <h1 dir="ltr" className="text-start text-title font-semibold">
            {family.title}
          </h1>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-section font-semibold">{priceText}</span>
          {availability && <span className={`text-caption ${availability.tone}`}>{availability.text}</span>}
          {chosen?.sku && (
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(chosen.sku!).then(() => showToast("המק״ט הועתק"))}
              className="flex items-center gap-1.5 self-start text-caption text-muted hover:text-foreground"
              aria-label={`העתקת המק״ט ${chosen.sku}`}
            >
              <Ltr className="font-mono">{chosen.sku}</Ltr>
              <Copy size={14} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>

        {keys.map((key) => (
          <div key={key} className="flex flex-col gap-2">
            <span className="text-caption text-muted">{optionLabel(key)}</span>
            <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
              {picked.chips[key].map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  aria-pressed={chip.selected}
                  onClick={() => onChip(key, chip.value)}
                  className={`min-h-11 rounded-full px-4 text-[15px] transition-colors ${
                    chip.selected
                      ? "bg-foreground text-background"
                      : chip.enabled
                        ? "bg-surface shadow-[inset_0_0_0_1px_var(--line)] hover:bg-subtle"
                        : "bg-surface text-muted opacity-50 shadow-[inset_0_0_0_1px_var(--line)]"
                  }`}
                >
                  {chip.value === NONE ? "ללא" : <Ltr>{chip.value}</Ltr>}
                </button>
              ))}
            </div>
          </div>
        ))}

        {manySuppliers && offers.length > 1 && (
          <div className="flex flex-col gap-2">
            <span className="text-caption text-muted">ספק</span>
            <div className="flex flex-wrap gap-2">
              {offers.map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  aria-pressed={offer === chosen}
                  onClick={() => onSupplier(offer.supplierName)}
                  className={`flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] transition-colors ${
                    offer === chosen ? "bg-foreground text-background" : "bg-surface shadow-[inset_0_0_0_1px_var(--line)] hover:bg-subtle"
                  }`}
                >
                  <Ltr>{offer.supplierName}</Ltr>
                  <span className="text-caption opacity-70">{offer.priceIls === null ? "—" : formatIls(offer.priceIls)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="hidden md:block">{addControls}</div>
        <p className="text-caption text-muted">המחירים כוללים מע״מ. משלוח בישראל מתומחר בהצעת המחיר.</p>
        {chosen && (
          <a href={chosen.productUrl} target="_blank" rel="noopener noreferrer" className="self-start text-caption text-brand hover:underline">
            לעמוד המוצר באתר <Ltr>{chosen.supplierName}</Ltr>
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
                סל · <span className="tabular-nums">{cartCount}</span>
              </button>
            )}
          </div>
          {addControls}
        </div>
      )}
    </div>
  );
}
