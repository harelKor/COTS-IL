import type { Metadata } from "next";
import { InfoTextPage } from "@/components/info-text-page";

export const metadata: Metadata = {
  title: "משלוח וזמני אספקה",
  description: "מה כלול במחיר, זמני אספקה לפי ספק, ומסירה בישראל.",
};

/** The text is the admin's (הגדרות, תוכן האתר); the facts come from פרטי העסק. */
export default function ShippingPage() {
  return <InfoTextPage page="shipping" />;
}
