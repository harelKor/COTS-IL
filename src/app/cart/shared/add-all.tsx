"use client";

import { shopifyImage } from "@/lib/images";
import { Check } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { mergeCart } from "@/app/cart/actions";
import { type AddableLine } from "@/components/cart-actions";
import { openCart } from "@/components/cart-pill";
import { canEditCart, mergeLocal, replaceLines, useCart } from "@/components/cart-store";
import { Ltr } from "@/components/ltr";
import { showToast } from "@/components/toast";
import { formatIls } from "@/domain/pricing";

type SharedLine = AddableLine & { qty: number };

/**
 * A shared cart's lines, each marked when it's already in this viewer's cart,
 * and one button that brings the cart up to the shared quantities (never adds
 * on top, so opening the link twice doesn't double anything).
 */
export function SharedCart({ lines, children }: { lines: SharedLine[]; children?: React.ReactNode }) {
  const cart = useCart();
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const own = new Map(cart.lines.map((l) => [l.variantId, l.qty]));
  const missing = lines.filter((l) => (own.get(l.variantId) ?? 0) < l.qty);
  const editable = canEditCart(cart.mode);

  function addAll() {
    if (cart.mode !== "ordering") {
      const changed = mergeLocal(lines);
      setDone(true);
      showToast(changed > 0 ? `עודכנו ${changed} פריטים בסל` : "הכל כבר בסל", "default", { label: "לסל", run: openCart });
      return;
    }
    startTransition(async () => {
      const result = await mergeCart(lines.map((l) => ({ variantId: l.variantId, qty: l.qty }))).catch(() => null);
      if (!result || result.error || !result.lines) {
        showToast(result?.error ?? "אין חיבור לשרת. נסו שוב.", "error");
        return;
      }
      replaceLines(result.lines);
      setDone(true);
      const skipped = result.skipped.length ? `, ${result.skipped.length} לא ניתנים להזמנה` : "";
      showToast(result.added > 0 ? `עודכנו ${result.added} פריטים בסל${skipped}` : `הכל כבר בסל${skipped}`, result.skipped.length ? "error" : "default", {
        label: "לסל",
        run: openCart,
      });
    });
  }

  return (
    <>
      <ul className="rounded-card bg-surface px-4">
        {lines.map((l) => {
          const inCart = own.get(l.variantId) ?? 0;
          return (
            <li key={l.variantId} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
              <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-tile">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {l.image && <img {...shopifyImage(l.image, 56)} loading="lazy" alt={l.title} referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />}
              </span>
              <Link href={l.href} className="min-w-0 flex-1 hover:text-brand">
                <Ltr className="line-clamp-2 text-start text-[15px] font-medium">{l.title}</Ltr>
                <span className="block truncate text-caption text-muted">
                  <Ltr>{[l.supplierName, l.options, l.sku].filter(Boolean).join(", ")}</Ltr>
                </span>
                {inCart > 0 && (
                  <span className="mt-1 inline-flex rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-medium text-brand">
                    {inCart >= l.qty ? "כבר בסל" : `בסל: ${inCart}`}
                  </span>
                )}
              </Link>
              <span className="shrink-0 text-caption text-muted tabular-nums">×{l.qty}</span>
              <span className="w-20 shrink-0 text-end font-semibold tabular-nums">{l.unitPriceIls === null ? "—" : formatIls(l.unitPriceIls * l.qty)}</span>
            </li>
          );
        })}
      </ul>
      {children}
      {editable && (
        <button
          type="button"
          disabled={pending || done || missing.length === 0}
          onClick={addAll}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-6 font-medium text-white hover:bg-brand-strong disabled:bg-success"
        >
          {pending ? (
            "מוסיף…"
          ) : done || missing.length === 0 ? (
            <>
              <Check size={18} aria-hidden /> הכל בסל
            </>
          ) : missing.length === lines.length ? (
            `הוספת כל ${lines.length} הפריטים לסל`
          ) : (
            `הוספת ${missing.length} הפריטים החסרים לסל`
          )}
        </button>
      )}
    </>
  );
}
