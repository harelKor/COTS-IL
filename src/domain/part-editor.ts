import { hasUsdPrice } from "./pricing";

/**
 * מוצרים (S16c): the admin's product editor. A synced part keeps the store's values in
 * products/variants (store_* columns) and the admin's edits in product_overrides and
 * variant_overrides, so the nightly sync never undoes them. A custom part ("הוספת חלק",
 * source = 'custom') is the admin's own: its edits are its store values.
 */

export type PartSource = "synced" | "custom";
export type VariantOption = { name: string; value: string };

/** Deleting: a custom part nobody ordered goes; anything else is only hidden, so order history stays whole. */
export function partRemoval(part: { source: PartSource; orderLines: number }): "delete" | "hide" {
  return part.source === "custom" && part.orderLines === 0 ? "delete" : "hide";
}

/** The same rule for one variant of a custom part. */
export const variantRemoval = partRemoval;

export type ProductStore = { title: string; descriptionHtml: string | null; images: string[] };
export type ProductEdit = ProductStore & { available: boolean | null };
export type ProductOverrideFields = { title: string | null; descriptionHtml: string | null; images: string[] | null; available: boolean | null };

function sameList(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * A synced part's edit as overrides: only what differs from the store is kept, so an
 * edit that matches the store again removes that override. `available` null means "as
 * the store says"; true or false pins it.
 */
export function productOverrideFields(store: ProductStore, edit: ProductEdit): ProductOverrideFields {
  const title = edit.title.trim();
  const description = edit.descriptionHtml?.trim() || null;
  return {
    title: title && title !== store.title ? title : null,
    descriptionHtml: description !== (store.descriptionHtml?.trim() || null) ? (description ?? "") : null,
    images: sameList(edit.images, store.images) ? null : edit.images,
    available: edit.available,
  };
}

export type VariantStore = { sku: string | null; options: VariantOption[]; priceUsd: string | null };
export type VariantEdit = { sku: string | null; options: VariantOption[]; priceUsd: string | null; fixedIls: number | null; hidden: boolean };
export type VariantOverrideFields = { priceUsd: string | null; fixedIls: string | null; sku: string | null; options: VariantOption[] | null; hidden: boolean };

function sameOptions(a: VariantOption[], b: VariantOption[]) {
  return a.length === b.length && a.every((o, i) => o.name === b[i].name && o.value === b[i].value);
}

/** A synced variant's edit as an override, keeping only what differs from the store. */
export function variantOverrideFields(store: VariantStore, edit: VariantEdit): VariantOverrideFields {
  const usd = hasUsdPrice(edit.priceUsd) ? Number(edit.priceUsd).toFixed(2) : null;
  const storeUsd = hasUsdPrice(store.priceUsd) ? Number(store.priceUsd).toFixed(2) : null;
  const sku = edit.sku?.trim() || null;
  return {
    priceUsd: usd !== storeUsd ? usd : null,
    fixedIls: edit.fixedIls !== null && edit.fixedIls > 0 ? edit.fixedIls.toFixed(2) : null,
    sku: sku !== (store.sku?.trim() || null) ? (sku ?? "") : null,
    options: sameOptions(edit.options, store.options) ? null : edit.options,
    hidden: edit.hidden,
  };
}

/** An override with nothing in it is deleted rather than stored. */
export function isEmptyVariantOverride(o: VariantOverrideFields): boolean {
  return o.priceUsd === null && o.fixedIls === null && o.sku === null && o.options === null && !o.hidden;
}

export function isEmptyProductOverrideFields(o: ProductOverrideFields): boolean {
  return o.title === null && o.descriptionHtml === null && o.images === null && o.available === null;
}

/**
 * What a family's ₪ range is computed from (product_families.min_list_usd): USD × the
 * part's multiplier, or a fixed ₪ price ÷ the rate, so × the rate gives it back.
 */
export function listUsd(v: { priceUsd: string | null; markup: string | null; fixedIls: string | null }, rate: number): number | null {
  if (v.fixedIls !== null && Number(v.fixedIls) > 0 && rate > 0) return Number(v.fixedIls) / rate;
  if (!hasUsdPrice(v.priceUsd)) return null;
  return Number(v.priceUsd) * Number(v.markup ?? 1);
}

/** Option names and one variant's values from the form, dropping empty pairs. */
export function readOptions(names: string[], values: string[]): VariantOption[] {
  return names.flatMap((name, i) => {
    const n = name.trim();
    const v = (values[i] ?? "").trim();
    return n && v ? [{ name: n, value: v }] : [];
  });
}

/** The option names a part's variants use, in first-seen order. */
export function optionNames(variants: { options: VariantOption[] }[]): string[] {
  return [...new Set(variants.flatMap((v) => v.options.map((o) => o.name)))];
}

/** A handle for a custom part: latin letters and digits from its name, else "part". */
export function customHandle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "part";
}

/** Badges on a product card. */
export function partBadges(p: { hidden: boolean; source: PartSource; manualPrice: boolean }): ("מוסתר" | "מחיר ידני" | "חלק ידני")[] {
  const out: ("מוסתר" | "מחיר ידני" | "חלק ידני")[] = [];
  if (p.hidden) out.push("מוסתר");
  if (p.manualPrice) out.push("מחיר ידני");
  if (p.source === "custom") out.push("חלק ידני");
  return out;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** The admin writes a description as plain text: blank lines make paragraphs, line breaks stay. Escaped, so it can't carry markup. */
export function textToHtml(text: string): string | null {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paragraphs.length) return null;
  return paragraphs.map((p) => `<p>${p.replace(/[&<>"']/g, (c) => ESCAPES[c]).replace(/\n/g, "<br>")}</p>`).join("");
}

/** A sanitized description as editable text: paragraphs, list items and breaks become new lines. */
export function htmlToText(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Whether the text in the editor is still the store's description (whitespace aside). */
export function sameDescription(storeHtml: string | null, text: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  return norm(htmlToText(storeHtml)) === norm(text);
}
