"use client";

import { ChevronLeft, Plus } from "lucide-react";
import Link from "next/link";
import { useRef, useState, ViewTransition } from "react";
import { choose, NONE, pick } from "@/domain/families/pick";
import { optionLabel } from "@/domain/families/sort";
import { formatIls } from "@/domain/pricing";
import { isAvailabilityFresh } from "@/domain/reports";
import type { CardFamily, CardVariant } from "@/lib/catalog";
import { familyHref, productImageTransition } from "@/lib/catalog-links";
import { addToCartNow, type AddableLine } from "./cart-actions";
import { useCart } from "./cart-store";
import { Ltr } from "./ltr";
import { QtyStepper } from "./qty-stepper";

/** Shopify's CDN resizes on request; cards only need a few hundred pixels. */
function sized(src: string | null, width: number) {
  if (!src) return null;
  return src.startsWith("https://cdn.shopify.com/") ? `${src}${src.includes("?") ? "&" : "?"}width=${width}` : src;
}

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

/** A dot for availability, with the words for screen readers and on hover. */
function AvailabilityDot({ available, checkedAt }: { available: boolean | null; checkedAt: string }) {
  const fresh = isAvailabilityFresh(new Date(checkedAt), new Date());
  const [color, text] =
    available === null || !fresh ? ["bg-muted", "זמינות לא אומתה"] : available ? ["bg-success", "זמין אצל הספק"] : ["bg-warning", "לא זמין כרגע"];
  return (
    <span className="flex items-center gap-1.5 text-caption text-muted" title={text}>
      <span className={`size-2 shrink-0 rounded-full ${color}`} aria-hidden />
      <span>{text}</span>
    </span>
  );
}

type Props = {
  family: CardFamily;
  /** Choices already made by the catalog's filters, e.g. { bore: '1/2" Hex' }. */
  preset?: Record<string, string>;
  layout?: "grid" | "row";
};

/**
 * A family in the catalog. "+" adds a single part right away; for a part with
 * sizes it opens chips on the card, and picking the last one adds it. Once in
 * the cart, "+" becomes a stepper. Nothing here leaves the page.
 */
export function FamilyCard({ family, preset = {}, layout = "grid" }: Props) {
  const { mode, lines } = useCart();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const image = useRef<HTMLDivElement>(null);

  const keys = family.optionKeys;
  const picked = pick(family.variants, keys, { ...preset, ...choices });
  const singlePart = family.variants.length > 0 && pick(family.variants, keys, {}).chosen !== null;
  const current = singlePart ? family.variants[0] : picked.chosen;
  const inCart = current ? lines.find((l) => l.variantId === current.id) : undefined;
  const familyInCart = lines.filter((l) => family.variants.some((v) => v.id === l.variantId)).reduce((n, l) => n + l.qty, 0);
  const canAdd = mode === "ordering" && family.variants.length > 0;
  const href = familyHref(family.slug, current?.sku ?? current?.id ?? null);
  const photo = sized(current?.image ?? family.image, layout === "row" ? 160 : 400);

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

  function onPlus() {
    if (singlePart) addToCartNow(lineFor(family, family.variants[0]), 1, image.current);
    else setOpen((o) => !o);
  }

  function onChip(key: string, value: string) {
    const next = choose(family.variants, keys, { ...preset, ...choices }, key, value);
    setChoices(next);
    const settled = pick(family.variants, keys, next).chosen;
    // Picking the last size adds it: two taps for a part with one option. A size that's
    // already in the cart isn't added again; its stepper shows instead.
    if (settled) {
      if (!lines.some((l) => l.variantId === settled.id)) addToCartNow(lineFor(family, settled), 1, image.current);
      setOpen(false);
    }
  }

  const action = !canAdd ? null : inCart ? (
    <QtyStepper variantId={inCart.variantId} qty={inCart.qty} label={family.title} size="sm" />
  ) : (
    <button
      type="button"
      onClick={onPlus}
      aria-expanded={singlePart ? undefined : open}
      aria-label={singlePart ? `הוספה לסל: ${family.title}` : `בחירת אפשרות והוספה לסל: ${family.title}`}
      className={`flex size-11 shrink-0 items-center justify-center rounded-full transition duration-200 active:scale-90 ${
        open ? "bg-foreground text-background" : "bg-brand text-white"
      }`}
    >
      <Plus size={20} strokeWidth={2} aria-hidden className={`transition-transform duration-200 ${open ? "rotate-45" : ""}`} />
    </button>
  );

  const picker = open && !singlePart && (
    <div className="flex flex-col gap-3 rounded-xl bg-subtle p-3" role="group" aria-label="בחירת אפשרות">
      {keys.map((key) => (
        <div key={key} className="flex flex-col gap-1.5">
          <span className="text-caption text-muted">{optionLabel(key)}</span>
          <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
            {picked.chips[key].map((chip) => (
              <button
                key={chip.value}
                type="button"
                disabled={!chip.enabled && !chip.selected}
                aria-pressed={chip.selected}
                onClick={() => onChip(key, chip.value)}
                className={`min-h-11 rounded-full px-3 text-caption transition-colors ${
                  chip.selected
                    ? "bg-foreground text-background"
                    : chip.enabled
                      ? "bg-surface text-foreground hover:bg-background"
                      : "bg-surface text-muted line-through opacity-50"
                }`}
              >
                {chip.value === NONE ? "ללא" : <Ltr>{chip.value}</Ltr>}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Link href={href} className="flex items-center gap-1 text-caption text-brand hover:underline">
        כל הפרטים והאפשרויות
        <ChevronLeft size={14} aria-hidden className="rtl:rotate-0 ltr:rotate-180" />
      </Link>
    </div>
  );

  const photoTile = (
    <div ref={image} className={`overflow-hidden bg-tile ${layout === "row" ? "size-16 rounded-xl p-1" : "aspect-square w-full rounded-card p-4"}`}>
      {photo && (
        // Hot-linked from the supplier's CDN, as agreed in the plan, so next/image is not used.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={family.title} loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
      )}
    </div>
  );

  if (layout === "row") {
    return (
      <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
        <div className="flex items-center gap-3">
          <Link href={href} className="shrink-0">
            {photoTile}
          </Link>
          <Link href={href} className="min-w-0 flex-1 hover:text-brand">
            <Ltr className="line-clamp-2 text-start text-[15px] font-medium">{family.title}</Ltr>
            <span className="block truncate text-caption text-muted">
              <Ltr>{family.supplierNames.join(" · ")}</Ltr>
              {current?.sku && (
                <>
                  {" · "}
                  <Ltr className="font-mono">{current.sku}</Ltr>
                </>
              )}
              {!current && family.variantCount > 1 && ` · ${family.variantCount.toLocaleString("he-IL")} אפשרויות`}
            </span>
          </Link>
          <div className="hidden w-32 sm:block">
            <AvailabilityDot available={current?.available ?? family.available} checkedAt={family.checkedAt} />
          </div>
          <span className="w-20 shrink-0 text-end text-[15px] font-semibold">{price}</span>
          <div className="flex w-28 shrink-0 justify-end">{action}</div>
        </div>
        {picker}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2">
      <Link href={href} className="group flex flex-col gap-3 rounded-card p-1 transition-transform duration-200 ease-out hover:-translate-y-0.5">
        <ViewTransition name={productImageTransition(family.id)} share="morph" default="none">
          <div className="rounded-card transition-shadow duration-200 group-hover:shadow-lift">{photoTile}</div>
        </ViewTransition>
        <div className="flex flex-col gap-1 px-1">
          <span className="flex items-center justify-between gap-2 text-caption text-muted">
            <Ltr className="truncate">{family.supplierNames.join(" · ")}</Ltr>
            {familyInCart > 0 && <span className="shrink-0 rounded-full bg-subtle px-2 text-foreground">בסל: {familyInCart}</span>}
          </span>
          <h2 dir="ltr" className="line-clamp-2 text-start text-[15px] font-medium tracking-normal">
            {family.title}
          </h2>
          {current && keys.length > 0 && (
            <Ltr className="truncate text-caption text-muted">{keys.flatMap((k) => (current.options[k] ? [current.options[k]] : [])).join(" · ")}</Ltr>
          )}
        </div>
      </Link>
      <div className="flex items-end justify-between gap-2 px-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-semibold">{price}</span>
          {!current && family.variantCount > 1 && (
            <span className="text-caption text-muted">{family.variantCount.toLocaleString("he-IL")} אפשרויות</span>
          )}
          <AvailabilityDot available={current?.available ?? family.available} checkedAt={family.checkedAt} />
        </div>
        {action}
      </div>
      {picker}
    </li>
  );
}
