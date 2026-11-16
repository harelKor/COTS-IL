import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { cache, Suspense } from "react";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { AdminBanner } from "./admin-banner";
import { AdminTabs, TabsNav } from "./admin-tabs";

/** Admin titles read "קבוצות | ניהול": this template replaces the shop's " | BLUEHUB" for everything under /admin. */
export const metadata: Metadata = { title: { default: "ניהול", template: "%s | ניהול" }, robots: { index: false } };

/** Every admin page gives up after 30 s and shows `error.tsx`, instead of streaming for 300 s. */
export const maxDuration = 30;

/**
 * What waits on the admin, and nothing else (S14). Orders: a request to quote, or an approved
 * order with something the admin can do now (lines to order, stock to put on a delivery note,
 * a note to deliver). Vendors: suppliers with lines to buy, i.e. the batches on "הזמנות ספקים".
 * One query per request.
 */
const waitingCounts = cache(async () => {
  await requireAdmin();
  const {
    rows: [row],
  } = await db.execute<{ orders: number; vendor: number }>(sql`
      WITH to_buy AS (
        SELECT i.order_id, v.supplier_id
          FROM quote_lines ql
          JOIN quotes q ON q.id = ql.quote_id AND q.status = 'approved'
          JOIN team_orders o ON o.id = q.order_id AND o.status = 'approved'
          JOIN team_order_items i ON i.id = ql.item_id
          JOIN variants v ON v.id = i.variant_id
         WHERE ql.qty > coalesce((
           SELECT sum(a.qty) FROM po_allocations a JOIN po_lines l ON l.id = a.po_line_id
           JOIN supplier_pos p ON p.id = l.po_id WHERE a.order_item_id = i.id AND p.status = 'ordered'
         ), 0)
      ),
      to_deliver AS (
        SELECT i.order_id
          FROM stock_allocations sa
          JOIN team_order_items i ON i.id = sa.order_item_id
         WHERE sa.qty > coalesce((SELECT sum(di.qty) FROM delivery_items di WHERE di.allocation_id = sa.id), 0)
        UNION
        SELECT i.order_id
          FROM deliveries d
          JOIN delivery_items di ON di.delivery_id = d.id
          JOIN stock_allocations sa ON sa.id = di.allocation_id
          JOIN team_order_items i ON i.id = sa.order_item_id
         WHERE d.status = 'prepared'
      )
      SELECT
        (SELECT count(*)::int FROM team_orders o
          WHERE o.status = 'submitted'
             OR (o.status = 'approved' AND (o.id IN (SELECT order_id FROM to_buy) OR o.id IN (SELECT order_id FROM to_deliver)))
        ) AS orders,
        (SELECT count(DISTINCT supplier_id)::int FROM to_buy) AS vendor
  `);
  return { orders: row?.orders ?? 0, vendor: row?.vendor ?? 0 };
});

async function Badge({ kind }: { kind: "orders" | "vendor" }) {
  const count = (await waitingCounts())[kind];
  if (count <= 0) return null;
  return (
    <span className="rounded-full bg-brand px-2 py-0.5 text-caption font-semibold text-white tabular-nums">{count}</span>
  );
}

/** The tab links render at once; only the two counts stream in. */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  const badges = {
    orders: (
      <Suspense>
        <Badge kind="orders" />
      </Suspense>
    ),
    vendor: (
      <Suspense>
        <Badge kind="vendor" />
      </Suspense>
    ),
  };
  return (
    <>
      {/* The path is request data, so the active tab waits in Suspense; the fallback is the same links. */}
      <Suspense fallback={<TabsNav pathname="" badges={{ orders: null, vendor: null }} />}>
        <AdminTabs badges={badges} />
      </Suspense>
      {/* Health (M1) and the go-live checklist, on every admin page; streams in after the tabs. */}
      <Suspense>
        <AdminBanner />
      </Suspense>
      {children}
    </>
  );
}
