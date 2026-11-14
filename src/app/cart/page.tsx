import { WhatsAppLink } from "@/components/whatsapp-link";
import type { Metadata } from "next";
import { CartPanel } from "@/components/cart-panel";
import { ShareCartButton } from "@/components/share-cart-button";

export const metadata: Metadata = { title: "סל" };

/** The cart as a page, for links and bookmarks. The same panel as the cart sheet. */
export default function CartPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-title font-semibold">הסל</h1>
        <ShareCartButton />
      </div>
      <div className="rounded-card bg-surface px-6 py-4">
        <CartPanel />
      </div>
      <WhatsAppLink text="שאלה על הסל ב-COTS-IL" />
    </div>
  );
}
