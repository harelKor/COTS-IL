/**
 * Which offer a family page link (`?v=` and `?vendor=`) opens on. Two vendors can sell
 * one part under one SKU (CTRE and WCP both sell the Kraken X60 as WCP-0940), so a SKU
 * alone can name two offers: the vendor settles it, and a variant id always does.
 */

export type Linkable = { id: string; sku: string | null; supplierCode: string };

const norm = (s: string | null | undefined) => s?.trim().toLowerCase() || null;

/**
 * The variant `?v=` names: a variant id, or a SKU in any case. Of several offers with
 * that SKU, the one from `?vendor=`, else the first (the list comes best offer first).
 */
export function findLinked<V extends Linkable>(variants: V[], v: string | null | undefined, vendor?: string | null): V | undefined {
  const wanted = norm(v);
  if (!wanted) return undefined;
  const byId = variants.find((x) => x.id.toLowerCase() === wanted);
  if (byId) return byId;
  const bySku = variants.filter((x) => norm(x.sku) === wanted);
  return bySku.find((x) => x.supplierCode === vendor) ?? bySku[0];
}

/** What `?v=` says for a variant: its SKU, readable, unless another offer in the family has the same one. */
export function variantParam(variant: Linkable, variants: Linkable[]): string {
  const sku = variant.sku?.trim();
  if (!sku) return variant.id;
  const shared = variants.some((x) => x.id !== variant.id && norm(x.sku) === sku.toLowerCase());
  return shared ? variant.id : sku;
}
