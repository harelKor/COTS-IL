/**
 * Which spec filters are worth showing for what's in view. A spec that only a couple of
 * products have (an "outer diameter" on 2 of 94 motors) is noise, not a filter.
 */

/** A spec must cover at least this share of the products in view… */
export const MIN_FACET_SHARE = 0.15;
/** …and at least this many of them. */
export const MIN_FACET_FAMILIES = 3;
/** A filter with fewer choices than this has nothing to choose between. */
export const MIN_FACET_VALUES = 2;

export type FacetCandidate = {
  key: string;
  /** Products in view that have this spec at all. */
  families: number;
  values: number;
};

/**
 * Keeps the specs that fit what's in view: common enough and with a real choice. A spec
 * the user already filtered by always stays, so its chips can still be cleared.
 */
export function isRelevantFacet(facet: FacetCandidate, total: number, selected: readonly string[] = []): boolean {
  if (selected.includes(facet.key)) return true;
  if (facet.values < MIN_FACET_VALUES) return false;
  return facet.families >= MIN_FACET_FAMILIES && facet.families >= total * MIN_FACET_SHARE;
}
