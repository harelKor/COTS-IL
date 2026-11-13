import { getBusiness } from "@/lib/settings";

/** "תנאי תשלום: …" from the admin's settings (פרטי העסק). Hidden until the business supplies its terms. */
export async function PaymentTerms({ className = "text-caption text-muted" }: { className?: string }) {
  const business = await getBusiness();
  if (!business.paymentTerms) return null;
  return <p className={className}>תנאי תשלום: {business.paymentTerms}</p>;
}
