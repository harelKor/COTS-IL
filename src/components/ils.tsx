import { formatIls } from "@/domain/pricing";

const SIGN = "₪";

/**
 * A ₪ amount from `formatIls`, its sign drawn in Heebo. Segoe UI (Windows) draws ₪ at lowercase
 * height, a size smaller than the digits beside it (audit, Nov 14, 2026); Heebo's sits at digit
 * height. The text and its direction marks are exactly formatIls's, so the order doesn't change.
 */
export function Ils({ amount }: { amount: number }) {
  const text = formatIls(amount);
  const at = text.indexOf(SIGN);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <span className="ils-sign">{SIGN}</span>
      {text.slice(at + 1)}
    </>
  );
}
