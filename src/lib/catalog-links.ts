/** A family's page. `variant` (a SKU or variant id) selects one of its variants. */
export function familyHref(slug: string, variant?: string | null, vendor?: string | null) {
  const path = `/catalog/p/${encodeURIComponent(slug)}`;
  const params = new URLSearchParams();
  if (variant) params.set("v", variant);
  // From a vendor's store: the page opens on that vendor's offer.
  if (vendor) params.set("vendor", vendor);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** A supplier product's own URL. It redirects to its family, with that variant selected. */
export function productHref(supplierCode: string, handle: string) {
  return `/catalog/${supplierCode}/${encodeURIComponent(handle)}`;
}

/** Names the product photo so it morphs from a card into the family page. */
export function productImageTransition(familyId: string) {
  return `product-image-${familyId}`;
}
