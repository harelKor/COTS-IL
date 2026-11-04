import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db, schema } from "@/db";
import { Availability, ProductImage, productHref } from "@/components/catalog";
import { Alert } from "@/components/form";
import { canOrder } from "@/domain/orders";
import { formatIls, priceIls } from "@/domain/pricing";
import { activeTeam, getViewer } from "@/lib/auth";
import { getCart, type CartLine } from "@/lib/orders";
import { removeCartItem, updateCartItem } from "./actions";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "סל | פורטל רכש FIRST" };

const canBuy = (line: CartLine) =>
  !line.variantMissing && !line.productMissing && line.productStatus === "published" && priceIls(line.priceUsd) !== null;

function CartRow({ line }: { line: CartLine }) {
  const unit = priceIls(line.priceUsd);
  return (
    <li className="flex flex-wrap gap-3 border-t border-line p-3 first:border-t-0">
      <ProductImage src={line.image ?? undefined} alt="" width={120} className="size-16 shrink-0 rounded" />
      <div className="min-w-48 flex-1">
        <Link dir="ltr" href={productHref(line.supplierCode, line.handle)} className="block text-start text-sm font-medium hover:text-brand">
          {line.title}
        </Link>
        <div dir="ltr" className="text-start text-xs text-muted">
          {line.options.map((o) => o.value).join(" / ")} {line.supplierSku ?? "no supplier SKU"}
        </div>
        {canBuy(line) ? (
          <Availability available={line.available} checkedAt={line.checkedAt} />
        ) : (
          <span className="text-xs text-danger">לא ניתן להזמין יותר, צריך להסיר מהסל</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <form action={updateCartItem} className="flex items-center gap-1">
          <input type="hidden" name="variantId" value={line.variantId} />
          <input
            name="qty"
            type="number"
            min={1}
            max={9999}
            defaultValue={line.qty}
            aria-label="כמות"
            className="h-9 w-16 rounded-md border border-line bg-surface px-2 text-sm"
          />
          <button className="h-9 rounded-md border border-line px-2 text-xs hover:bg-subtle">עדכון</button>
        </form>
        <form action={removeCartItem}>
          <input type="hidden" name="variantId" value={line.variantId} />
          <button className="h-9 rounded-md px-2 text-xs text-danger hover:bg-subtle">הסרה</button>
        </form>
      </div>
      <div className="w-20 text-end text-sm font-semibold">{unit !== null && formatIls(unit * line.qty)}</div>
    </li>
  );
}

async function Cart() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/cart");
  const team = activeTeam(viewer);
  if (!team) {
    if (viewer.isAdmin) return <p className="text-muted">לחשבון הספק הישראלי אין סל. הזמנות נשלחות מחשבונות של קבוצות.</p>;
    redirect("/pending");
  }
  if (!canOrder(team.role)) return <Alert>ההרשאה שלכם בקבוצה היא לצפייה בלבד. בקשו ממנהל הקבוצה הרשאת קניין.</Alert>;

  const lines = await getCart(team.id);
  if (lines.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-surface p-8 text-center text-muted">
        הסל ריק.{" "}
        <Link href="/catalog" className="text-brand hover:underline">
          לקטלוג
        </Link>
      </p>
    );
  }

  const groups = [...Map.groupBy(lines, (line) => line.supplierName)];
  const subtotal = (group: CartLine[]) => group.reduce((sum, line) => sum + (priceIls(line.priceUsd) ?? 0) * line.qty, 0);
  const [details] = await db.select().from(schema.teams).where(eq(schema.teams.id, team.id));

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          הסל משותף לכל הקבוצה: {team.name} · <span className="ltr">{`${team.program} ${team.number}`}</span>
        </p>
        {groups.map(([supplier, group]) => (
          <section key={supplier} className="overflow-hidden rounded-lg border border-line bg-surface">
            <div className="flex justify-between bg-subtle px-3 py-2 text-sm">
              <span className="ltr font-semibold">{supplier}</span>
              <span>{formatIls(subtotal(group))}</span>
            </div>
            <ul>
              {group.map((line) => (
                <CartRow key={line.variantId} line={line} />
              ))}
            </ul>
          </section>
        ))}
        <div className="flex justify-between rounded-lg border border-line bg-surface p-4 font-semibold">
          <span>סה״כ כולל מע״מ</span>
          <span>{formatIls(subtotal(lines))}</span>
        </div>
        <p className="text-sm text-muted">משלוח בישראל לא כלול, והספק הישראלי מתמחר אותו בהצעה הסופית.</p>
      </div>
      <CheckoutForm
        defaults={{
          address: details.address ?? "",
          contactName: details.contactName ?? viewer.fullName ?? "",
          contactPhone: details.contactPhone ?? "",
        }}
      />
    </div>
  );
}

export default function CartPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">סל</h1>
      <Suspense fallback={<p className="text-muted">טוען…</p>}>
        <Cart />
      </Suspense>
    </div>
  );
}
