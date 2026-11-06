import type { Metadata } from "next";
import { CartPanel } from "@/components/cart-panel";

export const metadata: Metadata = { title: "סל" };

/** The cart as a page, for links and bookmarks. The same panel as the cart sheet. */
export default function CartPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <h1 className="text-title font-semibold">הסל</h1>
      <div className="rounded-card bg-surface px-6 py-4">
        <CartPanel />
      </div>
    </div>
  );
}
