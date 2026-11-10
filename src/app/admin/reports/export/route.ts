import ExcelJS from "exceljs";
import type { NextRequest } from "next/server";
import { LINE_LABELS, lineStatus } from "@/domain/order-status";
import { profitSummary } from "@/domain/reports";
import { requireAdmin } from "@/lib/auth";
import { getOrderLines } from "@/lib/order-status";
import { getImportCosts, getPurchases, getSales, parsePeriod } from "@/lib/reports";

type Cell = string | number | Date | null;
type Sheet = { name: string; columns: { header: string; width: number }[]; rows: Cell[][] };

const COST_LABELS = { customs: "מכס", freight: "הובלה", broker: "עמיל מכס", vat: "מע״מ יבוא" } as const;

async function buildSheet(type: string, params: Record<string, string>): Promise<Sheet | null> {
  const period = parsePeriod(params);

  if (type === "sales") {
    const rows = await getSales(period);
    return {
      name: "מכירות",
      columns: [
        { header: "הזמנה", width: 10 },
        { header: "קבוצה", width: 24 },
        { header: "תאריך הבקשה", width: 20 },
        { header: "הצעה ראשונה", width: 20 },
        { header: "אושרה", width: 20 },
        { header: "פריטים ₪", width: 12 },
        { header: "משלוח ₪", width: 12 },
        { header: "סה״כ ₪", width: 12 },
        { header: "רכש $", width: 12 },
      ],
      rows: rows.map((s) => [
        s.number,
        `${s.teamProgram} ${s.teamNumber} ${s.teamName}`,
        s.submittedAt,
        s.firstQuoteAt,
        s.approvedAt,
        s.subtotalIls,
        s.shippingIls,
        s.subtotalIls + s.shippingIls,
        s.purchaseUsd,
      ]),
    };
  }

  if (type === "purchasing") {
    const rows = await getPurchases(period);
    return {
      name: "רכש",
      columns: [
        { header: "הזמנת ספק", width: 12 },
        { header: "ספק", width: 22 },
        { header: "אסמכתא", width: 20 },
        { header: "תאריך", width: 20 },
        { header: "יחידות", width: 10 },
        { header: "סה״כ $", width: 12 },
      ],
      rows: rows.map((p) => [p.number, p.supplierName, p.supplierOrderRef, p.orderedAt, p.units, p.totalUsd]),
    };
  }

  if (type === "imports") {
    const rows = await getImportCosts(period);
    return {
      name: "עלויות יבוא",
      columns: [
        { header: "משלוח", width: 10 },
        { header: "ספק", width: 22 },
        { header: "סוג", width: 14 },
        { header: "סכום ₪", width: 12 },
        { header: "בר קיזוז", width: 10 },
        { header: "אסמכתא", width: 20 },
        { header: "נרשם", width: 20 },
      ],
      rows: rows.map((c) => [
        c.shipmentNumber,
        c.supplierName,
        COST_LABELS[c.type],
        c.amountIls,
        c.vatReclaimable ? "כן" : "לא",
        c.reference,
        c.createdAt,
      ]),
    };
  }

  if (type === "shortages") {
    const rows = (await getOrderLines()).filter((i) => i.quoted > i.delivered);
    return {
      name: "חוסרים",
      columns: [
        { header: "קבוצה", width: 24 },
        { header: "הזמנה", width: 10 },
        { header: "פריט", width: 50 },
        { header: "מק״ט", width: 24 },
        { header: "אושר", width: 8 },
        { header: "הוזמן", width: 8 },
        { header: "הוקצה", width: 8 },
        { header: "נמסר", width: 8 },
        { header: "חסר", width: 8 },
        { header: "מצב", width: 22 },
      ],
      rows: rows.map((i) => [
        `${i.teamProgram} ${i.teamNumber} ${i.teamName}`,
        i.orderNumber,
        i.title,
        i.supplierSku,
        i.quoted,
        i.ordered,
        i.allocated,
        i.delivered,
        i.quoted - i.delivered,
        LINE_LABELS[lineStatus(i)],
      ]),
    };
  }

  if (type === "profit") {
    const rate = Number(params.rate);
    if (!(rate > 0)) return null;
    const [sales, costs] = await Promise.all([getSales(period), getImportCosts(period)]);
    const revenueInclVat = sales.reduce((sum, s) => sum + s.subtotalIls + s.shippingIls, 0);
    const purchaseUsd = sales.reduce((sum, s) => sum + s.purchaseUsd, 0);
    const p = profitSummary({ revenueInclVat, purchaseUsd, usdIlsRate: rate, importCosts: costs });
    return {
      name: "רווחיות",
      columns: [
        { header: "שורה", width: 34 },
        { header: "סכום", width: 16 },
      ],
      rows: [
        ["מכירות כולל מע״מ ₪", revenueInclVat],
        ["הכנסה ללא מע״מ ₪", p.revenueExVat],
        ["רכש $", purchaseUsd],
        ["שער דולר", rate],
        ["רכש ₪", p.purchaseIls],
        ["עלויות יבוא (ללא מע״מ בר קיזוז) ₪", p.importCostIls],
        ["מע״מ בר קיזוז (לא נספר) ₪", p.reclaimableVatIls],
        ["רווח ₪", p.profit],
        ["שיעור רווח %", p.marginPct],
      ],
    };
  }

  return null;
}

export async function GET(request: NextRequest) {
  await requireAdmin();
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const type = params.type ?? "";
  const sheet = await buildSheet(type, params);
  if (!sheet) return new Response("Unknown report or missing exchange rate", { status: 400 });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheet.name, { views: [{ rightToLeft: true }] });
  worksheet.columns = sheet.columns;
  worksheet.getRow(1).font = { bold: true };
  sheet.rows.forEach((row) => worksheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="report-${type}.xlsx"`,
    },
  });
}
