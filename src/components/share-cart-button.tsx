"use client";

import { Share2 } from "lucide-react";
import { encodeCart } from "@/domain/cart-share";
import { useCart } from "./cart-store";
import { showToast } from "./toast";

/**
 * "שיתוף הסל", in the cart sheet's header (and on /cart): a link with the cart's parts
 * and quantities. Phones get the system share sheet (WhatsApp is one tap away);
 * elsewhere the link is copied. Nothing while the cart is empty.
 */
export function ShareCartButton() {
  const { lines } = useCart();
  if (lines.length === 0) return null;

  async function share() {
    const url = `${window.location.origin}/cart/shared?items=${encodeCart(lines)}`;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "סל ב-COTS-IL", url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast("הקישור לסל הועתק");
    } catch {
      showToast("לא הצלחנו להעתיק", "error");
    }
  }

  return (
    <button type="button" onClick={share} className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-caption font-medium text-brand hover:bg-subtle">
      <Share2 size={16} strokeWidth={1.75} aria-hidden />
      שיתוף הסל
    </button>
  );
}
