/**
 * Local only: the S10A acceptance data for "כל ההזמנות" and "הזמנות ספקים".
 * Run after `npm run seed` and a sync: `npx tsx scripts/seed-s10a.ts`.
 * It replaces its own earlier run (orders noted "S10A seed") and refuses any
 * database that isn't the local stack on port 54422.
 *
 * - one request to quote, one quote waiting for the team
 * - one order split over WCP and AndyMark, plus two more WCP orders: one WCP batch serving three orders
 * - one order received with a partial delivery (1 of 2 delivered)
 * - one order on a delivery note not yet confirmed
 * - one rejected order
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
const url = process.env.DATABASE_URL ?? "";
if (!/@(127\.0\.0\.1|localhost):544\d\d\//.test(url)) throw new Error("Refusing: DATABASE_URL is not the local 544xx stack");
const sql = postgres(url);
const NOTE = "S10A seed";

async function variant(code: string, offset: number) {
  const [v] = await sql`
    SELECT v.id, v.supplier_variant_id, v.supplier_sku, v.options, v.price_usd, p.title, p.url, s.id AS supplier_id, s.name AS supplier_name, s.code
    FROM variants v JOIN products p ON p.id = v.product_id JOIN suppliers s ON s.id = v.supplier_id
    WHERE s.code = ${code} AND v.price_usd::numeric >= 3 AND p.status = 'published'
    ORDER BY v.price_usd::numeric, v.id LIMIT 1 OFFSET ${offset}`;
  if (!v) throw new Error(`No ${code} variant: run npm run sync first`);
  return v;
}

async function team(program: "FRC" | "FTC", number: number, name: string) {
  const [t] = await sql`
    INSERT INTO teams (program, number, name, contact_name, contact_phone, status)
    VALUES (${program}, ${number}, ${name}, 'איש קשר', '050-0000000', 'active')
    ON CONFLICT (program, number) DO UPDATE SET status = 'active' RETURNING id`;
  return t.id as string;
}

async function main() {
  const [admin] = await sql`SELECT id FROM profiles WHERE is_admin LIMIT 1`;
  if (!admin) throw new Error("No admin: run npm run seed first");

  await sql.begin(async (tx) => {
    // Remove the previous run, children first.
    const old = sql`SELECT i.id FROM team_order_items i JOIN team_orders o ON o.id = i.order_id WHERE o.notes = ${NOTE}`;
    await tx`DELETE FROM delivery_items WHERE allocation_id IN (SELECT id FROM stock_allocations WHERE order_item_id IN (${old}))`;
    await tx`DELETE FROM deliveries d WHERE NOT EXISTS (SELECT 1 FROM delivery_items di WHERE di.delivery_id = d.id)`;
    await tx`DELETE FROM stock_allocations WHERE order_item_id IN (${old})`;
    const pos = await tx`SELECT DISTINCT l.po_id FROM po_allocations a JOIN po_lines l ON l.id = a.po_line_id WHERE a.order_item_id IN (${old})`;
    const poIds = pos.map((p) => p.po_id as string);
    if (poIds.length) {
      await tx`DELETE FROM receipt_lines WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id IN ${tx(poIds)})`;
      await tx`DELETE FROM receipts WHERE shipment_id IN (SELECT id FROM shipments WHERE po_id IN ${tx(poIds)})`;
      await tx`DELETE FROM shipments WHERE po_id IN ${tx(poIds)}`;
      await tx`DELETE FROM po_allocations WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id IN ${tx(poIds)})`;
      await tx`DELETE FROM supplier_pos WHERE id IN ${tx(poIds)}`;
    }
    await tx`DELETE FROM team_orders WHERE notes = ${NOTE}`;
  });

  const [w1, w2, a1] = [await variant("wcp", 0), await variant("wcp", 1), await variant("andymark", 0)];
  const t1690 = (await sql`SELECT id FROM teams WHERE program = 'FRC' AND number = 1690`)[0]?.id ?? (await team("FRC", 1690, "Orbit"));
  const t2231 = await team("FRC", 2231, "Ninja");
  const t99 = await team("FTC", 99, "Demo Kids");

  let day = 9;
  async function order(teamId: string, status: string, lines: { v: typeof w1; qty: number }[], extra: Record<string, unknown> = {}) {
    const submittedAt = new Date(Date.now() - day-- * 86_400_000);
    const [o] = await sql`
      INSERT INTO team_orders (team_id, status, delivery_method, contact_name, contact_phone, notes, submitted_by, submitted_at, rejection_reason)
      VALUES (${teamId}, ${status}, 'pickup', 'איש קשר', '050-0000000', ${NOTE}, ${admin.id}, ${submittedAt}, ${(extra.reason as string) ?? null})
      RETURNING id, number`;
    const items: { id: string; qty: number; v: typeof w1 }[] = [];
    for (const { v, qty } of lines) {
      const price = Math.round(Number(v.price_usd) * 4.2);
      const [i] = await sql`
        INSERT INTO team_order_items (order_id, variant_id, qty, supplier_code, supplier_name, supplier_sku, title, options, product_url, price_usd, multiplier, unit_price_ils, priced_at)
        VALUES (${o.id}, ${v.id}, ${qty}, ${v.code}, ${v.supplier_name}, ${v.supplier_sku}, ${v.title}, ${sql.json(v.options)}, ${v.url}, ${v.price_usd}, 4.2, ${price}, now())
        RETURNING id`;
      items.push({ id: i.id, qty, v });
    }
    if (status !== "submitted" && status !== "rejected") {
      const [q] = await sql`
        INSERT INTO quotes (order_id, version, status, shipping_ils, sent_by, sent_at)
        VALUES (${o.id}, 1, ${status === "approved" ? "approved" : "sent"}, 0, ${admin.id}, ${new Date(submittedAt.getTime() + 3_600_000)})
        RETURNING id`;
      for (const i of items) {
        await sql`INSERT INTO quote_lines (quote_id, item_id, qty, unit_price_ils)
          SELECT ${q.id}, id, qty, unit_price_ils FROM team_order_items WHERE id = ${i.id}`;
      }
    }
    return { ...o, items };
  }

  /** An ordered supplier order for these lines, shipped, received and allocated in full. */
  async function received(supplierId: string, lines: { id: string; qty: number; v: typeof w1 }[]) {
    const [po] = await sql`INSERT INTO supplier_pos (supplier_id, status, supplier_order_ref, ordered_at, created_by)
      VALUES (${supplierId}, 'ordered', 'SEED-REF', now() - interval '5 days', ${admin.id}) RETURNING id`;
    const [sh] = await sql`INSERT INTO shipments (po_id, carrier, tracking, created_by) VALUES (${po.id}, 'UPS', '1Z999', ${admin.id}) RETURNING id`;
    const [r] = await sql`INSERT INTO receipts (shipment_id, received_by) VALUES (${sh.id}, ${admin.id}) RETURNING id`;
    const allocations: string[] = [];
    for (const l of lines) {
      const [pl] = await sql`INSERT INTO po_lines (po_id, variant_id, supplier_variant_id, supplier_sku, title, options, product_url, unit_cost_usd)
        VALUES (${po.id}, ${l.v.id}, ${l.v.supplier_variant_id}, ${l.v.supplier_sku}, ${l.v.title}, ${sql.json(l.v.options)}, ${l.v.url}, ${l.v.price_usd}) RETURNING id`;
      await sql`INSERT INTO po_allocations (po_line_id, order_item_id, qty) VALUES (${pl.id}, ${l.id}, ${l.qty})`;
      await sql`INSERT INTO shipment_items (shipment_id, po_line_id, qty) VALUES (${sh.id}, ${pl.id}, ${l.qty})`;
      const [rl] = await sql`INSERT INTO receipt_lines (receipt_id, po_line_id, qty_received, location) VALUES (${r.id}, ${pl.id}, ${l.qty}, 'A1') RETURNING id`;
      const [sa] = await sql`INSERT INTO stock_allocations (receipt_line_id, order_item_id, qty) VALUES (${rl.id}, ${l.id}, ${l.qty}) RETURNING id`;
      allocations.push(sa.id);
    }
    return allocations;
  }

  async function note(teamId: string, status: "prepared" | "delivered", items: { allocation: string; qty: number }[]) {
    const [d] = await sql`INSERT INTO deliveries (team_id, method, status, recipient_name, delivered_at, created_by)
      VALUES (${teamId}, 'pickup', ${status}, ${status === "delivered" ? "איש קשר" : null}, ${status === "delivered" ? new Date() : null}, ${admin.id}) RETURNING id`;
    for (const i of items) await sql`INSERT INTO delivery_items (delivery_id, allocation_id, qty) VALUES (${d.id}, ${i.allocation}, ${i.qty})`;
  }

  await order(t2231, "rejected", [{ v: w2, qty: 1 }], { reason: "הקבוצה ביטלה את הצורך" });
  const partial = await order(t99, "approved", [{ v: a1, qty: 2 }]);
  const [partialAlloc] = await received(a1.supplier_id, partial.items);
  await note(t99, "delivered", [{ allocation: partialAlloc, qty: 1 }]);
  const out = await order(t2231, "approved", [{ v: w2, qty: 1 }]);
  const [outAlloc] = await received(w1.supplier_id, out.items);
  await note(t2231, "prepared", [{ allocation: outAlloc, qty: 1 }]);
  await order(t1690, "approved", [{ v: w1, qty: 1 }, { v: a1, qty: 2 }]); // split over WCP and AndyMark
  await order(t2231, "approved", [{ v: w1, qty: 3 }]);
  await order(t99, "approved", [{ v: w2, qty: 2 }]);
  await order(t2231, "quote_sent", [{ v: w2, qty: 4 }]);
  await order(t1690, "submitted", [{ v: w1, qty: 2 }, { v: w2, qty: 1 }]);

  console.log("Seeded S10A acceptance orders");
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end();
  process.exit(1);
});
