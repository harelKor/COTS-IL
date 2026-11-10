import { sql } from "drizzle-orm";
import { cache, Suspense } from "react";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { AdminTabs, TabsNav } from "./admin-tabs";

/** Every admin page gives up after 30 s and shows `error.tsx`, instead of streaming for 300 s. */
export const maxDuration = 30;

/** What waits on the admin: requests to quote, and approved lines not yet on any vendor order. One query per request. */
const waitingCounts = cache(async () => {
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
  return { orders: row?.orders ?? 0, vendor: row?.vendor ?? 0 };
});

async function Badge({ kind }: { kind: "orders" | "vendor" }) {
  const count = (await waitingCounts())[kind];
  if (count <= 0) return null;
  return (
    <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white tabular-nums">{count}</span>
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
      {children}
    </>
  );
}
