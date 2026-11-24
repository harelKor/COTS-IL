import { vatSplit } from "./pricing";

export type ImportCost = { amountIls: number; vatReclaimable: boolean };

/**
 * Sales in the period, with the VAT they include taken out. Prices include VAT since Nov 24,
 * 2026 (D1): each quote's own rate (quotes.vat_rate) splits it; a quote from before then has
 * none, so its total is all revenue.
 */
export function salesRevenue(sales: { subtotalIls: number; shippingIls: number; vatRate: string | number | null }[]) {
  let gross = 0;
  let vat = 0;
  for (const s of sales) {
    const total = s.subtotalIls + s.shippingIls;
    gross += total;
    vat += s.vatRate === null ? 0 : vatSplit(total, Number(s.vatRate)).vat;
  }
  vat = Math.round(vat * 100) / 100;
  return { grossIls: gross, vatIls: vat, netIls: Math.round((gross - vat) * 100) / 100 };
}

/**
 * Profit = revenue − purchases − import costs, where revenue is net of the VAT the
 * sale prices include (salesRevenue). Reclaimable import VAT
 * comes back from the tax authority, so it isn't a cost (spec §8, AT-10).
 * Purchases arrive in shekels already, converted by `purchaseCost`.
 */
export function profitSummary(input: { revenueIls: number; purchaseIls: number; importCosts: ImportCost[] }) {
  const importCostIls = input.importCosts.filter((c) => !c.vatReclaimable).reduce((sum, c) => sum + c.amountIls, 0);
  const reclaimableVatIls = input.importCosts.filter((c) => c.vatReclaimable).reduce((sum, c) => sum + c.amountIls, 0);
  const profit = input.revenueIls - input.purchaseIls - importCostIls;
  return {
    revenueIls: input.revenueIls,
    purchaseIls: input.purchaseIls,
    importCostIls,
    reclaimableVatIls,
    profit,
    marginPct: input.revenueIls > 0 ? (profit / input.revenueIls) * 100 : null,
  };
}

/**
 * What the purchases cost in shekels. By default each supplier order is converted at
 * the Bank of Israel rate of its own date (`purchaseIlsAtBoi`, computed in SQL); the
 * admin can instead type the real card rate, which then applies to everything.
 * `rate` is the effective rate (shekels per dollar), for showing in a note.
 */
export function purchaseCost(
  rows: { purchaseUsd: number; purchaseIlsAtBoi: number }[],
  overrideRate: number | null,
): {
  ils: number;
  usd: number;
  rate: number | null;
  source: "override" | "boi";
} {
  const usd = rows.reduce((sum, r) => sum + r.purchaseUsd, 0);
  if (overrideRate !== null)
    return {
      ils: usd * overrideRate,
      usd,
      rate: overrideRate,
      source: "override",
    };
  const ils = rows.reduce((sum, r) => sum + r.purchaseIlsAtBoi, 0);
  return { ils, usd, rate: usd > 0 ? ils / usd : null, source: "boi" };
}

const HOUR = 60 * 60 * 1000;

function finishedHours(pairs: { start: Date; end: Date | null }[]): number[] {
  return pairs
    .filter((p): p is { start: Date; end: Date } => p.end !== null)
    .map((p) => (p.end.getTime() - p.start.getTime()) / HOUR);
}

/** Average hours between two dates, ignoring rows where the later one hasn't happened. */
export function averageHours(pairs: { start: Date; end: Date | null }[]): number | null {
  const hours = finishedHours(pairs);
  return hours.length === 0 ? null : hours.reduce((sum, h) => sum + h, 0) / hours.length;
}

/** The middle value, which a single slow order doesn't drag the way it drags the average. */
export function medianHours(pairs: { start: Date; end: Date | null }[]): number | null {
  const hours = finishedHours(pairs).sort((a, b) => a - b);
  if (hours.length === 0) return null;
  const mid = Math.floor(hours.length / 2);
  return hours.length % 2 === 1 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;
}

const oneDecimal = (n: number) => n.toFixed(1).replace(/\.0$/, "");

/** "45 דקות", "3.5 שעות", "2.4 ימים": the unit that keeps the number readable. */
export function formatDuration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(Math.round(hours * 60), 0)} דקות`;
  if (hours < 24) return `${oneDecimal(hours)} שעות`;
  return `${oneDecimal(hours / 24)} ימים`;
}

/** Today's date in Israel as YYYY-MM-DD, whatever the server's own time zone. */
export function israelToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
  }).format(now);
}

export type PeriodPreset = {
  key: string;
  label: string;
  from?: string;
  to?: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Quick date ranges for the reports: this month, last month, the season (January to April), everything. */
export function periodPresets(now: Date): PeriodPreset[] {
  const [year, month] = israelToday(now).split("-").map(Number);
  const lastMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const range = (y: number, m: number) => ({
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(lastDay(y, m))}`,
  });
  return [
    { key: "this-month", label: "החודש", ...range(year, month) },
    {
      key: "last-month",
      label: "החודש שעבר",
      ...range(lastMonth.year, lastMonth.month),
    },
    {
      key: "season",
      label: "העונה (ינואר–אפריל)",
      from: `${year}-01-01`,
      to: `${year}-04-30`,
    },
    { key: "all", label: "הכול" },
  ];
}

/** After this long without a successful sync, availability counts as unverified (spec §7, AT-11). */
export const AVAILABILITY_MAX_AGE_DAYS = 3;

export function isAvailabilityFresh(checkedAt: Date, now: Date): boolean {
  return now.getTime() - checkedAt.getTime() <= AVAILABILITY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
