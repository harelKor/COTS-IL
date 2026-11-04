export type DemandRow = {
  orderItemId: string;
  orderNumber: number;
  teamLabel: string;
  supplierId: string;
  supplierName: string;
  platform: "shopify" | "bigcommerce" | "csv";
  variantId: string;
  supplierVariantId: string;
  supplierSku: string | null;
  title: string;
  options: { name: string; value: string }[];
  productUrl: string;
  costUsd: string | null;
  quotedQty: number;
  allocatedQty: number;
};

export type Allocation = { orderItemId: string; orderNumber: number; teamLabel: string; qty: number };

export type ConsolidatedLine = Pick<
  DemandRow,
  "variantId" | "supplierVariantId" | "supplierSku" | "title" | "options" | "productUrl" | "costUsd"
> & { qty: number; allocations: Allocation[] };

export type SupplierDemand = {
  supplierId: string;
  supplierName: string;
  platform: DemandRow["platform"];
  lines: ConsolidatedLine[];
};

/**
 * Groups what still needs buying by supplier and variant. The same variant from
 * several teams becomes one line, and each team's share stays on it (AT-06).
 */
export function consolidateDemand(rows: DemandRow[]): SupplierDemand[] {
  const suppliers = new Map<string, SupplierDemand>();
  const lines = new Map<string, ConsolidatedLine>();

  for (const row of rows) {
    const need = row.quotedQty - row.allocatedQty;
    if (need <= 0) continue;

    let supplier = suppliers.get(row.supplierId);
    if (!supplier) {
      supplier = { supplierId: row.supplierId, supplierName: row.supplierName, platform: row.platform, lines: [] };
      suppliers.set(row.supplierId, supplier);
    }

    let line = lines.get(row.variantId);
    if (!line) {
      line = {
        variantId: row.variantId,
        supplierVariantId: row.supplierVariantId,
        supplierSku: row.supplierSku,
        title: row.title,
        options: row.options,
        productUrl: row.productUrl,
        costUsd: row.costUsd,
        qty: 0,
        allocations: [],
      };
      lines.set(row.variantId, line);
      supplier.lines.push(line);
    }

    line.qty += need;
    line.allocations.push({
      orderItemId: row.orderItemId,
      orderNumber: row.orderNumber,
      teamLabel: row.teamLabel,
      qty: need,
    });
  }

  return [...suppliers.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName));
}

type CartLine = { supplierVariantId: string; qty: number };

/** A link that opens the supplier's own Shopify cart already filled, for the mentor to pay by hand. */
export function shopifyCartUrl(baseUrl: string, lines: CartLine[]): string {
  const items = lines.map((l) => `${encodeURIComponent(l.supplierVariantId)}:${l.qty}`).join(",");
  return `${baseUrl}/cart/${items}`;
}

type ListLine = Pick<ConsolidatedLine, "supplierSku" | "title" | "options" | "qty">;

export function describeOptions(options: { value: string }[]): string {
  return options.map((o) => o.value).join(" / ");
}

/** A plain list to paste or follow on suppliers without cart links. Items with no SKU fall back to their name. */
export function skuList(lines: ListLine[]): string {
  return lines
    .map((l) => {
      const options = describeOptions(l.options);
      const name = l.supplierSku ?? `(no SKU) ${l.title}${options ? ` - ${options}` : ""}`;
      return `${name} x ${l.qty}`;
    })
    .join("\n");
}

export function poTotalUsd(lines: { qty: number; unitCostUsd: string | null }[]): number {
  return lines.reduce((sum, l) => sum + l.qty * Number(l.unitCostUsd ?? 0), 0);
}
