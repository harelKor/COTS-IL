"use client";

import { ChevronLeft, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState, ViewTransition } from "react";
import { chipPrice, choose, NONE, pick } from "@/domain/families/pick";
import { optionLabel } from "@/domain/families/sort";
import { formatIls } from "@/domain/pricing";
import { availabilityStatus, isFresh, useNow } from "./availability";
import type { FamilyVariants } from "@/app/api/family/[id]/variants/route";
import type { CardFamily, CardVariant } from "@/lib/catalog";
import { familyHref, productImageTransition } from "@/lib/catalog-links";
import { imageLoading, shopifyImage } from "@/lib/images";
import { addToCartNow, type AddableLine } from "./cart-actions";
import { canEditCart, useCart } from "./cart-store";
import { Ltr } from "./ltr";
import { QtyStepper } from "./qty-stepper";

function lineFor(family: CardFamily, v: CardVariant): AddableLine {
  return {
    variantId: v.id,
    title: family.title,
    options: family.optionKeys.flatMap((k) => (v.options[k] ? [v.options[k]] : [])).join(" / "),
    sku: v.sku,
    image: v.image ?? family.image,
    href: familyHref(family.slug, v.sku ?? v.id),
    supplierName: v.supplierName,
    unitPriceIls: v.priceIls,
  };
}

type PartialStock = { of: number; available: number };

/** A dot for availability, with the words for screen readers and on hover. */
function AvailabilityDot({ available, checkedAt, partial }: { available: boolean | null; checkedAt: string; partial?: PartialStock }) {
  const fresh = isFresh(checkedAt, useNow());
  const { dot: color } = availabilityStatus(available, checkedAt, fresh);
  const text =
    available === null || !fresh
      ? "זמינות לא אומתה"
      : available && partial
        ? `${partial.available.toLocaleString("he-IL")} מתוך ${partial.of.toLocaleString("he-IL")} אפשרויות זמינות`
        : available
          ? "זמין אצל הספק"
          : "לא זמין כרגע";
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-caption text-muted" title={text}>
      <span className={`size-2 shrink-0 rounded-full ${color}`} aria-hidden />
      <span className="truncate">{text}</span>
    </span>
  );
}

/** The lowest price a chip leads to, small under its value. */
function ChipPrice({ value }: { value: number | null }) {
  return value === null ? null : <span className="text-[12px] opacity-70">{formatIls(value)}</span>;
}

type Props = {
  family: CardFamily;
  /** Choices already made by the catalog's filters, e.g. { bore: '1/2" Hex' }. */
  preset?: Record<string, string>;
  layout?: "grid" | "row";
  /** One of the first cards on screen: its photo loads at once. */
  eager?: boolean;
};

/** Below this width the chips open in a bottom sheet instead of over the card. */
const SHEET_QUERY = "(max-width: 639px)";

/**
 * A family in the catalog. "+" adds a single part right away, or the part the
 * filters already settled; for a part with sizes it opens chips (over the card,
 * or in a bottom sheet on a phone), and picking the last one adds it. Once in
 * the cart, "+" becomes a stepper. Nothing here leaves the page.
 */
export function FamilyCard({ family, preset = {}, layout = "grid", eager = false }: Props) {
  const { mode, lines } = useCart();
  const [open, setOpen] = useState(false);
  const [asSheet, setAsSheet] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  // Only a single part comes with its variant; the others load theirs on the first "+".
  const [variants, setVariants] = useState<CardVariant[] | null>(family.onlyVariant ? [family.onlyVariant] : null);
  const loading = useRef<Promise<CardVariant[]> | null>(null);
  const image = useRef<HTMLDivElement>(null);

  const keys = family.optionKeys;
  const picked = pick(variants ?? [], keys, { ...preset, ...choices });
  const singlePart = family.onlyVariant !== null;
  const current = singlePart ? family.onlyVariant : variants ? picked.chosen : null;
  const inCart = current ? lines.find((l) => l.variantId === current.id) : undefined;
  const page = familyHref(family.slug);
  const familyInCart = lines.filter((l) => l.href === page || l.href.startsWith(`${page}?`)).reduce((n, l) => n + l.qty, 0);
  const canAdd = canEditCart(mode) && family.orderable;

  /** Starts loading the variants (on hover or focus, so the chips are usually ready by the tap). */
  function loadVariants() {
    loading.current ??= fetch(`/api/family/${family.id}/variants`)
      .then((r) => r.json() as Promise<FamilyVariants>)
      .then((body) => {
        setVariants(body.variants);
        return body.variants;
      })
      .catch(() => {
        loading.current = null;
        return [];
      });
    return loading.current;
  }
  const href = familyHref(family.slug, current?.sku ?? current?.id ?? null);
  const photoSrc = current?.image ?? family.image;
  const photo = photoSrc ? shopifyImage(photoSrc, layout === "row" ? 64 : 240) : null;

  const price =
    current?.priceIls != null ? (
      formatIls(current.priceIls)
    ) : family.minPriceIls === null ? (
      <span className="text-caption font-normal text-muted">ייבדק בהצעה</span>
    ) : (
      <>
        {family.maxPriceIls !== family.minPriceIls && <span className="text-caption font-normal text-muted">החל מ-</span>}
        {formatIls(family.minPriceIls)}
      </>
    );

  /** Adds the part the card has settled on (one part, or the filters chose every option), or opens the chips. */
  function plusWith(list: CardVariant[]) {
    const settled = singlePart ? family.onlyVariant : pick(list, keys, { ...preset, ...choices }).chosen;
    if (settled && !open) addToCartNow(lineFor(family, settled), 1, image.current);
    else if (open) setOpen(false);
    else if (list.length > 0) {
      setAsSheet(window.matchMedia(SHEET_QUERY).matches);
      setOpen(true);
    }
  }

  function onPlus() {
    if (singlePart || variants) plusWith(variants ?? []);
    else void loadVariants().then(plusWith);
  }

  function onChip(key: string, value: string) {
    const list = variants ?? [];
    const next = choose(list, keys, { ...preset, ...choices }, key, value);
    setChoices(next);
    const settled = pick(list, keys, next).chosen;
    // Picking the last size adds it: two taps for a part with one option. A size that's
    // already in the cart isn't added again; its stepper shows instead. The sheet stays
    // open with the stepper, for the quantity; the picker over the card closes.
    if (settled) {
      if (!lines.some((l) => l.variantId === settled.id)) addToCartNow(lineFor(family, settled), 1, image.current);
      if (!asSheet) setOpen(false);
    }
  }

  const action = !canAdd ? null : inCart ? (
    <QtyStepper variantId={inCart.variantId} qty={inCart.qty} label={family.title} size="sm" />
  ) : (
    <button
      type="button"
      onClick={onPlus}
      onPointerEnter={singlePart ? undefined : () => void loadVariants()}
      onFocus={singlePart ? undefined : () => void loadVariants()}
      aria-expanded={singlePart ? undefined : open}
      aria-label={singlePart ? `הוספה לסל: ${family.title}` : `בחירת אפשרות והוספה לסל: ${family.title}`}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full transition duration-200 active:scale-90 ${
        open && !asSheet ? "bg-foreground text-background" : "bg-brand text-white"
      }`}
    >
      <Plus size={20} strokeWidth={2} aria-hidden className={`transition-transform duration-200 ${open && !asSheet ? "rotate-45" : ""}`} />
    </button>
  );

  const showPicker = open && !singlePart && variants !== null;

  /**
   * The option chips, one group per option. `scroll` caps each group's height, for the inline
   * (list) picker; `prices` puts under each chip the lowest price it leads to (the sheet).
   */
  const optionGroups = (scroll: boolean, prices = false) =>
    keys.map((key) => (
      <div key={key} className="flex flex-col gap-1.5">
        <span className="text-caption text-muted">{optionLabel(key)}</span>
        <div className={`flex flex-wrap gap-1.5 ${scroll ? "max-h-36 overflow-y-auto" : ""}`}>
          {picked.chips[key].map((chip) => (
            <button
              key={chip.value}
              type="button"
              disabled={!chip.enabled && !chip.selected}
              aria-pressed={chip.selected}
              onClick={() => onChip(key, chip.value)}
              className={`min-h-11 rounded-full px-3 text-caption transition-colors ${
                prices ? "flex flex-col items-center justify-center px-3.5 py-1 text-[15px] leading-tight" : ""
              } ${
                chip.selected
                  ? "bg-foreground text-background"
                  : chip.enabled
                    ? "bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--line)] hover:bg-background"
                    : "bg-surface text-muted line-through opacity-50"
              }`}
            >
              {chip.value === NONE ? "ללא" : <Ltr>{chip.value}</Ltr>}
              {prices && chip.enabled && <ChipPrice value={chipPrice(variants ?? [], picked.selected, key, chip.value)} />}
            </button>
          ))}
        </div>
      </div>
    ));

  const detailsLink = (
    <Link href={href} className="flex min-h-11 items-center gap-1 text-caption text-brand hover:underline">
      כל הפרטים והאפשרויות
      <ChevronLeft size={14} aria-hidden className="rtl:rotate-0 ltr:rotate-180" />
    </Link>
  );

  const photo_ = photo && (
    // Hot-linked from the supplier's CDN, as agreed in the plan, so next/image is not used.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo.src} srcSet={photo.srcSet} alt={family.title} {...imageLoading(eager)} referrerPolicy="no-referrer" className="size-full object-contain" />
  );

  // "3 מתוך 8 אפשרויות זמינות" when only some sizes are in stock, until one is chosen.
  const sets = family.optionSets ?? 0;
  const inStock = family.availableOptionSets ?? 0;
  const partial = !current && sets > 1 && inStock > 0 && inStock < sets ? { of: sets, available: inStock } : undefined;
  const availability = <AvailabilityDot available={current?.available ?? family.available} checkedAt={family.checkedAt} partial={partial} />;

  const closeSheet = (e: React.MouseEvent<HTMLElement>) => e.currentTarget.closest("dialog")?.close();

  /** On a phone: photo, chips with prices, then the stepper once the part is in the cart. */
  const sheet = showPicker && asSheet && (
    <dialog
      ref={(el) => {
        if (el && !el.open) el.showModal();
      }}
      aria-label={`בחירת אפשרות: ${family.title}`}
      className="sheet sheet-bottom"
      onClose={() => setOpen(false)}
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
    >
      <div className="flex max-h-[inherit] flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-white p-1 ring-1 ring-line">{photo_}</div>
          <div className="flex min-w-0 flex-1 flex-col">
            <Ltr className="line-clamp-2 text-start text-[15px] font-medium">{family.title}</Ltr>
            <span className="text-[15px] font-semibold">{price}</span>
          </div>
          <button
            type="button"
            onClick={closeSheet}
            aria-label="סגירה"
            className="-me-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-foreground"
          >
            <X size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">{optionGroups(false, true)}</div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {inCart ? (
            <>
              <QtyStepper variantId={inCart.variantId} qty={inCart.qty} label={family.title} />
              <button type="button" onClick={closeSheet} className="flex h-11 items-center rounded-full bg-brand px-6 font-medium text-white">
                סיום
              </button>
            </>
          ) : (
            <>
              <span className="text-caption text-muted">הבחירה האחרונה מוסיפה לסל</span>
              {detailsLink}
            </>
          )}
        </div>
      </div>
    </dialog>
  );

  if (layout === "row") {
    return (
      <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
        <div className="flex items-center gap-3">
          <Link href={href} className="shrink-0">
            <div ref={image} className="size-16 overflow-hidden rounded-xl bg-white p-1 ring-1 ring-line">
              {photo_}
            </div>
          </Link>
          <Link href={href} className="min-w-0 flex-1 hover:text-brand">
            <Ltr className="line-clamp-2 text-start text-[15px] font-medium">{family.title}</Ltr>
            <span className="block truncate text-caption text-muted">
              <Ltr>{family.supplierNames.join(", ")}</Ltr>
              {current?.sku && (
                <>
                  {", "}
                  <Ltr className="font-mono">{current.sku}</Ltr>
                </>
              )}
              {!current && family.variantCount > 1 && `, ${family.variantCount.toLocaleString("he-IL")} אפשרויות`}
            </span>
            {/* Under the title on a phone; its own column from 640px. */}
            <span className="block text-[15px] font-semibold sm:hidden">{price}</span>
          </Link>
          <div className="hidden w-32 sm:block">{availability}</div>
          <span className="hidden w-20 shrink-0 text-end text-[15px] font-semibold sm:block">{price}</span>
          <div className="flex shrink-0 justify-end sm:w-28">{action}</div>
        </div>
        {showPicker && !asSheet && (
          <div className="flex flex-col gap-3 rounded-xl bg-subtle p-3" role="group" aria-label="בחירת אפשרות">
            {optionGroups(true)}
            {detailsLink}
          </div>
        )}
        {sheet}
      </li>
    );
  }

  return (
    <li className="card-surface relative flex flex-col justify-between gap-3 rounded-card p-3 transition-[translate,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift">
      <Link href={href} className="flex flex-col gap-3">
        <ViewTransition name={productImageTransition(family.id)} share="morph" default="none">
          {/* Every photo on the same padded white tile: supplier photos are shot on white. */}
          <div ref={image} className="relative aspect-square w-full overflow-hidden rounded-xl bg-white p-3 ring-1 ring-line">
            {photo_}
            {familyInCart > 0 && (
              <span className="absolute end-2 top-2 rounded-full bg-foreground px-2 py-0.5 text-[12px] font-medium text-background tabular-nums">
                בסל: {familyInCart}
              </span>
            )}
          </div>
        </ViewTransition>
        <div className="flex flex-col gap-1">
          <Ltr className="truncate text-start text-caption text-muted">{family.supplierNames.join(", ")}</Ltr>
          <h2 dir="ltr" className="line-clamp-2 text-start text-[15px] leading-snug font-medium tracking-normal" title={family.title}>
            {family.title}
          </h2>
          {current && keys.length > 0 && (
            <Ltr className="truncate text-start text-caption text-muted">
              {keys.flatMap((k) => (current.options[k] ? [current.options[k]] : [])).join(", ")}
            </Ltr>
          )}
          {availability}
        </div>
      </Link>

      {/* In the cart, the stepper wraps to its own row on a narrow card instead of covering the price. */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-semibold">{price}</span>
          {/* What tells the options apart (teeth, bore), since the title is the same for all of them. */}
          {!current && family.variantCount > 1 && (
            <span className="truncate text-caption text-muted">
              {family.variantCount.toLocaleString("he-IL")} אפשרויות{keys.length > 0 && `: ${keys.map(optionLabel).join(", ")}`}
            </span>
          )}
        </div>
        {action}
      </div>

      {sheet}
      {/* From 640px the picker covers the card above its "+" instead of growing it, so every card in the row keeps its height. */}
      {showPicker && !asSheet && (
        <div
          role="group"
          aria-label="בחירת אפשרות"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          className="absolute inset-x-2 top-2 bottom-16 z-20 flex flex-col gap-2 rounded-xl border border-line bg-glass p-3 shadow-lift backdrop-blur-xl transition duration-150 ease-out starting:scale-95 starting:opacity-0"
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="סגירה"
            className="absolute end-0.5 top-0.5 z-10 flex size-11 items-center justify-center rounded-full text-muted hover:text-foreground"
          >
            <X size={18} strokeWidth={1.75} aria-hidden />
          </button>
          <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">{optionGroups(false)}</div>
          {detailsLink}
        </div>
      )}
    </li>
  );
}
