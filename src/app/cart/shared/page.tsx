import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Ltr } from "@/components/ltr";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { decodeCart } from "@/domain/cart-share";
import { formatIls } from "@/domain/pricing";
import { getSharedLines } from "@/lib/catalog";
import { AddAll } from "./add-all";

export const metadata: Metadata = { title: "סל משותף", robots: { index: false } };

function thumb(src: string) {
  return src.startsWith("https://cdn.shopify.com/") ? `${src}${src.includes("?") ? "&" : "?"}width=120` : src;
}

async function Shared({ searchParams }: PageProps<"/cart/shared">) {
  const { items } = await searchParams;
  const wanted = decodeCart(typeof items === "string" ? items : null);
  const found = await getSharedLines(wanted.map((w) => w.variantId));
  const lines = wanted.flatMap((w) => {
    const line = found.find((f) => f.variantId === w.variantId);
    return line ? [{ ...line, qty: w.qty }] : [];
  });
  const total = lines.reduce((sum, l) => sum + (l.unitPriceIls ?? 0) * l.qty, 0);

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
      <ul className="rounded-card bg-surface px-4">
        {lines.map((l) => (
          <li key={l.variantId} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
            <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tile">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {l.image && <img src={thumb(l.image)} alt={l.title} referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />}
            </span>
            <Link href={l.href} className="min-w-0 flex-1 hover:text-brand">
              <Ltr className="line-clamp-2 text-start text-[15px] font-medium">{l.title}</Ltr>
              <span className="block truncate text-caption text-muted">
                <Ltr>{[l.supplierName, l.options, l.sku].filter(Boolean).join(", ")}</Ltr>
              </span>
            </Link>
            <span className="shrink-0 text-caption text-muted tabular-nums">×{l.qty}</span>
            <span className="w-20 shrink-0 text-end font-semibold tabular-nums">{l.unitPriceIls === null ? "—" : formatIls(l.unitPriceIls * l.qty)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between">
        <span className="text-muted">סה״כ משוער, כולל מע״מ</span>
        <span className="text-section font-semibold tabular-nums">{formatIls(total)}</span>
      </div>
      {wanted.length > lines.length && <p className="text-caption text-muted">{wanted.length - lines.length} פריטים מהקישור כבר לא נמכרים ולא יתווספו.</p>}
      <AddAll lines={lines} />
    </div>
  );
}

export default function SharedCartPage(props: PageProps<"/cart/shared">) {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div>
        <h1 className="text-title font-semibold">סל משותף</h1>
        <p className="text-caption text-muted">מישהו מהקבוצה שיתף אתכם סל. אפשר להוסיף את כולו לסל שלכם בלחיצה.</p>
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
