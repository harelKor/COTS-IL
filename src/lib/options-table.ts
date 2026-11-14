import "server-only";
import { optionLabel, sortByOptions } from "@/domain/families/sort";
import { formatIls, priceIls, type PriceContext } from "@/domain/pricing";
import { availabilityStatus } from "./availability-text";
import type { FamilyVariant } from "./catalog";
import { familyHref } from "./catalog-links";
import { variantParam } from "@/domain/families/link";

/** Escapes text for HTML. */
function esc(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

type TableFamily = { slug: string; title: string; images: string[]; optionKeys: string[] };

/**
 * The "all options" table as one HTML string: hundreds of rows as a React tree were most
 * of the page's weight. Styles match the rest of the page; OptionsTable fixes stale statuses,
 * sorts by a column and adds a row to the cart (McMaster-style: quantity and Add on each row).
 */
export function optionsTableHtml(all: FamilyVariant[], family: TableFamily, rate: PriceContext) {
  const keys = family.optionKeys;
  const variants = sortByOptions(all, keys);
  const manySuppliers = new Set(all.map((v) => v.supplierCode)).size > 1;
  const sortable = [...keys.map(optionLabel), ...(manySuppliers ? ["ספק"] : []), "מק״ט"];
  const head = [
    ...sortable.map(
      (h, i) =>
        `<th aria-sort="none"><button type="button" data-sort="${i}" class="flex min-h-11 items-center gap-1 hover:text-foreground">${esc(h)}<span aria-hidden="true" class="text-xs">↕</span></button></th>`,
    ),
    `<th><button type="button" data-sort="${sortable.length}" class="flex min-h-11 items-center gap-1 hover:text-foreground">מחיר<span aria-hidden="true" class="text-xs">↕</span></button></th>`,
    `<th><span class="sr-only">הוספה לסל</span></th>`,
  ].join("");
  const rows = variants.map((v) => {
    const price = priceIls(v.priceUsd, rate, v.markup, v.fixedIls);
    const status = availabilityStatus(v.available, v.checkedAt.toISOString(), true, { shipsLater: v.shipsLater, eta: v.shipsLaterEta });
    const options = keys.flatMap((k) => (v.familyOptions[k] ? [v.familyOptions[k]] : [])).join(" / ");
    const href = familyHref(family.slug, variantParam(v, all));
    const line = {
      variantId: v.id,
      title: family.title,
      options,
      sku: v.sku,
      image: v.image ?? family.images[0] ?? null,
      href,
      supplierName: v.supplierName,
      unitPriceIls: price,
    };
    const ltr = (text: string) => `<td dir="ltr" class="text-start" data-value="${esc(text)}">${esc(text)}</td>`;
    const add =
      price === null
        ? `<td class="text-caption text-muted">בהצעה</td>`
        : `<td><div class="flex items-center gap-2"><input data-qty type="text" inputmode="numeric" dir="ltr" value="1" maxlength="4" aria-label="כמות" class="h-11 w-14 rounded-full bg-subtle text-center tabular-nums outline-none focus:ring-2 focus:ring-brand"><button type="button" data-add class="btn-brand h-11 rounded-full px-4 font-medium">הוספה</button></div></td>`;
    return `<tr data-line="${esc(JSON.stringify(line))}">${keys.map((k) => ltr(v.familyOptions[k] ?? "—")).join("")}${manySuppliers ? ltr(v.supplierName) : ""}<td class="text-xs" data-value="${esc(v.sku ?? "")}"><a href="${esc(href)}" class="text-brand hover:underline">${
      v.sku ? `<bdi dir="ltr" class="font-mono">${esc(v.sku)}</bdi>` : "ללא מק״ט ספק"
    }</a></td><td data-value="${price ?? ""}"><b class="block">${price === null ? "ייבדק בהצעה" : esc(formatIls(price))}</b><span class="text-caption ${status.tone}" data-checked="${v.checkedAt.toISOString()}">${esc(status.text)}</span></td>${add}</tr>`;
  });
  return `<table class="w-full text-sm [&_td]:p-3 [&_td]:whitespace-nowrap [&_th]:px-3 [&_th]:text-start [&_th]:font-medium [&_tr]:align-top"><thead class="sticky top-0 z-10 bg-subtle text-muted"><tr>${head}</tr></thead><tbody class="divide-y divide-line border-t border-line">${rows.join("")}</tbody></table>`;
}
