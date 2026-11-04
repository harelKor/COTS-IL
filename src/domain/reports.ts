/** Israeli VAT, which sale prices include. Change it here if the rate changes. */
export const VAT_RATE = 0.18;

export const excludingVat = (amountInclVat: number) => amountInclVat / (1 + VAT_RATE);

export type ImportCost = { amountIls: number; vatReclaimable: boolean };

/**
 * Profit = revenue without VAT − purchases − import costs. Reclaimable VAT comes
 * back from the tax authority, so it isn't a cost (spec §8, AT-10). The rate is
 * passed in because the spec's 1.6 multiplier isn't a currency conversion.
 */
export function profitSummary(input: {
  revenueInclVat: number;
  purchaseUsd: number;
  usdIlsRate: number;
  importCosts: ImportCost[];
}) {
  const revenueExVat = excludingVat(input.revenueInclVat);
  const purchaseIls = input.purchaseUsd * input.usdIlsRate;
  const importCostIls = input.importCosts.filter((c) => !c.vatReclaimable).reduce((sum, c) => sum + c.amountIls, 0);
  const reclaimableVatIls = input.importCosts.filter((c) => c.vatReclaimable).reduce((sum, c) => sum + c.amountIls, 0);
  const profit = revenueExVat - purchaseIls - importCostIls;
  return {
    revenueExVat,
    purchaseIls,
    importCostIls,
    reclaimableVatIls,
    profit,
    marginPct: revenueExVat > 0 ? (profit / revenueExVat) * 100 : null,
  };
}

/** Average hours between two dates, ignoring rows where the later one hasn't happened. */
export function averageHours(pairs: { start: Date; end: Date | null }[]): number | null {
  const done = pairs.filter((p): p is { start: Date; end: Date } => p.end !== null);
  if (done.length === 0) return null;
  const total = done.reduce((sum, p) => sum + (p.end.getTime() - p.start.getTime()), 0);
  return total / done.length / (60 * 60 * 1000);
}

/** After this long without a successful sync, availability counts as unverified (spec §7, AT-11). */
export const AVAILABILITY_MAX_AGE_DAYS = 3;

export function isAvailabilityFresh(checkedAt: Date, now: Date): boolean {
  return now.getTime() - checkedAt.getTime() <= AVAILABILITY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
