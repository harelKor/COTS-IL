import type { NextRequest } from "next/server";
import { paymentsCsv } from "@/domain/payments";
import { requireAdmin } from "@/lib/auth";
import { getPaymentsExport } from "@/lib/payments";

const isoDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

/** P1: the bookkeeper's payments CSV, optionally for a period (?from=&to=, by the day the money arrived). */
export async function GET(request: NextRequest) {
  await requireAdmin();
  const from = isoDate(request.nextUrl.searchParams.get("from"));
  const to = isoDate(request.nextUrl.searchParams.get("to"));
  const csv = paymentsCsv(await getPaymentsExport({ from, to }));
  const name = `payments${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.csv`;
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "no-store",
    },
  });
}
