import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { decodeCart } from "@/domain/cart-share";
import { formatIls } from "@/domain/pricing";
import { getSharedLines } from "@/lib/catalog";
import { SharedCart } from "./add-all";

export const metadata: Metadata = {
  title: "סל משותף",
  robots: { index: false },
};

async function Shared({ searchParams }: PageProps<"/cart/shared">) {
  const { items } = await searchParams;
  const wanted = decodeCart(typeof items === "string" ? items : null);
  const found = await getSharedLines(wanted.map((w) => w.variantId));
  const lines = wanted.flatMap((w) => {
    const line = found.find((f) => f.variantId === w.variantId);
    return line ? [{ ...line, qty: w.qty }] : [];
  });
  const total = lines.reduce(
    (sum, l) => sum + (l.unitPriceIls ?? 0) * l.qty,
    0,
  );

  if (lines.length === 0) {
    return (
      <p className="text-muted">
        הקישור ריק או שהפריטים בו כבר לא נמכרים.{" "}
        <Link href="/catalog" className="text-brand hover:underline">
          לקטלוג
        </Link>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <SharedCart lines={lines}>
        <div className="flex items-baseline justify-between">
          <span className="text-muted">סה״כ משוער, כולל מע״מ</span>
          <span className="text-section font-semibold tabular-nums">
            {formatIls(total)}
          </span>
        </div>
        {wanted.length > lines.length && (
          <p className="text-caption text-muted">
            {wanted.length - lines.length} פריטים מהקישור כבר לא נמכרים ולא
            יתווספו.
          </p>
        )}
      </SharedCart>
    </div>
  );
}

export default function SharedCartPage(props: PageProps<"/cart/shared">) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-title font-semibold">סל משותף</h1>
        <p className="text-caption text-muted">
          מישהו מהקבוצה שיתף אתכם סל. אפשר להוסיף את כולו לסל שלכם בלחיצה.
          פריטים שכבר בסל לא יוכפלו.
        </p>
      </div>
      <Suspense
        fallback={
          <Loading>
            <PageSkeleton rows={4} />
          </Loading>
        }
      >
        <Shared {...props} />
      </Suspense>
    </div>
  );
}
