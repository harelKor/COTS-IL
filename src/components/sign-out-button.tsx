"use client";

import { signout } from "@/app/auth/actions";
import { clearGuestCart } from "./cart-store";

/**
 * "יציאה" in the account menu. It also clears the browser's guest cart first, so
 * the next person on this browser doesn't find parts left from before (C-27).
 */
export function SignOutButton({ className }: { className: string }) {
  return (
    <form
      action={async () => {
        clearGuestCart();
        await signout();
      }}
    >
      <button className={className}>יציאה</button>
    </form>
  );
}
