import { z } from "zod";

/** Bank of Israel public API: the latest representative rate for one currency. */
export const BOI_USD_URL = "https://boi.org.il/PublicApi/GetExchangeRate?key=USD";

const responseSchema = z.object({
  key: z.literal("USD"),
  currentExchangeRate: z.number().positive(),
  unit: z.number().positive(),
  lastUpdate: z.string().min(10),
});

export type UsdRate = { rate: number; rateDate: string };

/** ILS per dollar and its date (yyyy-mm-dd) from the API's JSON. Throws on anything unexpected. */
export function parseBoiUsdRate(body: unknown): UsdRate {
  const parsed = responseSchema.parse(body);
  const rate = parsed.currentExchangeRate / parsed.unit;
  const rateDate = new Date(parsed.lastUpdate);
  if (Number.isNaN(rateDate.getTime())) throw new Error(`Bad rate date: ${parsed.lastUpdate}`);
  // Published in Israel's afternoon, so the date in Israel is the rate's date.
  const day = rateDate.toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  return { rate: Math.round(rate * 10000) / 10000, rateDate: day };
}

export async function fetchBoiUsdRate(): Promise<UsdRate> {
  const response = await fetch(BOI_USD_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from Bank of Israel`);
  return parseBoiUsdRate(await response.json());
}
