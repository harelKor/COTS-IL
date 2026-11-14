"use client";

import { useTransition } from "react";
import { signInWithGoogle } from "@/app/auth/actions";
import { cartSnapshot } from "@/components/cart-store";
import { withPendingCart } from "@/domain/cart-share";

/** "המשך עם Google" first on the login page; a guest's cart rides along in the return address, as in the cart sheet. */
export function GoogleButton({ next }: { next: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(() => {
          const { mode, lines } = cartSnapshot();
          return signInWithGoogle(withPendingCart(next, mode === "guest" ? lines : []));
        })
      }
      className="flex h-11 w-full items-center justify-center rounded-full bg-surface text-callout font-medium shadow-[inset_0_0_0_1px_var(--line)] hover:bg-subtle disabled:opacity-60"
    >
      {pending ? "פותח את Google…" : "המשך עם Google"}
    </button>
  );
}
