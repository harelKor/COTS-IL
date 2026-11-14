"use client";

import { X } from "lucide-react";
import { useState, useSyncExternalStore, type ReactNode } from "react";

const KEY = "cotsil:last-order-hidden";

/** The order id whose box was hidden, read from localStorage (null on the server or when blocked). */
const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const hiddenId = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

/**
 * The home page's "ההזמנה האחרונה" box with an X that hides it (a short fade, no confirm). The
 * dismissal is remembered for that order only, so the next order shows the box again.
 */
export function LastOrderNotice({ orderId, children }: { orderId: string; children: ReactNode }) {
  const [state, setState] = useState<"shown" | "fading" | "hidden">("shown");
  const stored = useSyncExternalStore(subscribe, hiddenId, () => null);

  if (state === "hidden" || stored === orderId) return null;

  const hide = () => {
    try {
      localStorage.setItem(KEY, orderId);
    } catch {
      // Hidden for this visit only.
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setState("hidden");
    else setState("fading");
  };

  return (
    <section
      onTransitionEnd={(e) => e.target === e.currentTarget && state === "fading" && setState("hidden")}
      className={`flex items-center gap-2 rounded-card bg-surface p-4 pe-2 shadow-lift transition-[opacity,translate] duration-200 ease-out ${
        state === "fading" ? "-translate-y-1 opacity-0" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">{children}</div>
      <button
        type="button"
        aria-label="הסתרה"
        onClick={hide}
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"
      >
        <X size={20} strokeWidth={1.75} aria-hidden />
      </button>
    </section>
  );
}
