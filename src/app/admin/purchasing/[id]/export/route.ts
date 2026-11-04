import ExcelJS from "exceljs";
import { notFound } from "next/navigation";
import { describeOptions } from "@/domain/purchasing";
import { requireAdmin } from "@/lib/auth";
import { getPo } from "@/lib/purchasing";

/** The purchase order as an Excel file, in English, without team details. */
export async function GET(_request: Request, { params }: RouteContext<"/admin/purchasing/[id]/export">) {
  await requireAdmin();
  const { id } = await params;
  const result = await getPo(id);
  if (!result) notFound();
  const { po, supplier, lines } = result;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`PO ${po.number}`);
  sheet.columns = [
    { header: "SKU", key: "sku", width: 26 },
    { header: "Description", key: "title", width: 60 },
    { header: "Options", key: "options", width: 30 },
    { header: "Qty", key: "qty", width: 8 },
    { header: "Unit USD", key: "unit", width: 12, style: { numFmt: "0.00" } },
    { header: "Total USD", key: "total", width: 12, style: { numFmt: "0.00" } },
    { header: "URL", key: "url", width: 50 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const line of lines) {
    const unit = Number(line.unitCostUsd ?? 0);
    sheet.addRow({
      sku: line.supplierSku ?? "no supplier SKU",
      title: line.title,
      options: describeOptions(line.options),
      qty: line.qty,
      unit,
      total: line.qty * unit,
      url: line.productUrl,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `PO-${po.number}-${supplier.code}.xlsx`;
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
