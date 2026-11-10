import { business } from "@/lib/business";

/** "תנאי תשלום: …" from src/lib/business.ts. Hidden until the business supplies its terms. */
export function PaymentTerms({ className = "text-caption text-muted" }: { className?: string }) {
  if (!business.paymentTerms) return null;
  return <p className={className}>תנאי תשלום: {business.paymentTerms}</p>;
}
