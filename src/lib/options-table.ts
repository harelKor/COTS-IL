import "server-only";
import { optionLabel, sortByOptions } from "@/domain/families/sort";
import { formatIls, priceIls } from "@/domain/pricing";
import { availabilityStatus } from "./availability-text";
import type { FamilyVariant } from "./catalog";
import { familyHref } from "./catalog-links";

/** Escapes text for HTML. */
function esc(text: string) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * The "all options" table as one HTML string: hundreds of rows as a React tree were most
 * of the page's weight. Styles match the rest of the page; OptionsTable fixes stale statuses.
 */
export function optionsTableHtml(all: FamilyVariant[], keys: string[], slug: string, rate: number) {
  const variants = sortByOptions(all, keys);
  const manySuppliers = new Set(all.map((v) => v.supplierCode)).size > 1;
  const head = [...keys.map(optionLabel), ...(manySuppliers ? ["ספק"] : []), "מק״ט", "מחיר"].map((h) => `<th>${esc(h)}</th>`).join("");
  const rows = variants.map((v) => {
    const price = priceIls(v.priceUsd, rate);
    const status = availabilityStatus(v.available, v.checkedAt.toISOString(), true);
    const ltr = (text: string) => `<td dir="ltr" class="text-start">${esc(text)}</td>`;
    return `<tr>${keys.map((k) => ltr(v.familyOptions[k] ?? "—")).join("")}${manySuppliers ? ltr(v.supplierName) : ""}<td class="text-xs"><a href="${esc(familyHref(slug, v.sku ?? v.id))}" class="text-brand hover:underline">${
      v.sku ? `<bdi dir="ltr" class="font-mono">${esc(v.sku)}</bdi>` : "ללא מק״ט ספק"
    }</a></td><td><b class="block">${price === null ? "ייבדק בהצעה" : esc(formatIls(price))}</b><span class="text-caption ${status.tone}" data-checked="${v.checkedAt.toISOString()}">${esc(status.text)}</span></td></tr>`;
  });
  return `<table class="w-full text-sm [&_td]:p-3 [&_td]:whitespace-nowrap [&_th]:p-3 [&_th]:text-start [&_th]:font-medium [&_tr]:align-top"><thead class="sticky top-0 bg-subtle text-muted"><tr>${head}</tr></thead><tbody class="divide-y divide-line border-t border-line">${rows.join("")}</tbody></table>`;
}
