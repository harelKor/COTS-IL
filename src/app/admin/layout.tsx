import { sql } from "drizzle-orm";
import { Suspense } from "react";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { AdminTabs } from "./admin-tabs";

/** What waits on the admin: requests to quote, and approved lines not yet on any vendor order. */
async function Tabs() {
  await requireAdmin();
  const [row] = await db.execute<{ orders: number; vendor: number }>(sql`
    SELECT
      (SELECT count(*)::int FROM team_orders WHERE status = 'submitted') AS orders,
      (SELECT count(DISTINCT i.order_id)::int
         FROM quote_lines ql
         JOIN quotes q ON q.id = ql.quote_id AND q.status = 'approved'
         JOIN team_orders o ON o.id = q.order_id AND o.status = 'approved'
         JOIN team_order_items i ON i.id = ql.item_id
        WHERE ql.qty > coalesce((
          SELECT sum(a.qty) FROM po_allocations a JOIN po_lines l ON l.id = a.po_line_id
          JOIN supplier_pos p ON p.id = l.po_id WHERE a.order_item_id = i.id AND p.status = 'ordered'
        ), 0)) AS vendor
  `);
  return <AdminTabs counts={{ orders: row?.orders ?? 0, vendor: row?.vendor ?? 0 }} />;
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <Suspense fallback={<AdminTabs counts={{ orders: 0, vendor: 0 }} />}>
        <Tabs />
      </Suspense>
      {children}
    </>
  );
}
