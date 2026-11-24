import type { PriceDiscount } from "@/domain/pricing";
import { StatusTag } from "./form";
import { Ils } from "./ils";

/**
 * The supplier's discount beside a price (goBILDA's FIRST team discount): the price before it,
 * struck through, and its tag ("הנחת FTC"). The price beside it is already the discounted one.
 */
export function DiscountNote({ discount, className }: { discount: PriceDiscount | null | undefined; className?: string }) {
  if (!discount) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-normal ${className ?? ""}`}>
      <s className="text-caption whitespace-nowrap text-muted tabular-nums">
        <span className="sr-only">במקום </span>
        <Ils amount={discount.beforeIls} />
      </s>
      <StatusTag tone="success">{discount.label}</StatusTag>
    </span>
  );
}
