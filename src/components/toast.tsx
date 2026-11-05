"use client";

import { useEffect, useSyncExternalStore } from "react";

type Toast = { id: number; text: string; tone: "default" | "error" };

let toast: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Shows a short message at the bottom of the screen. A new one replaces the last. */
export function showToast(text: string, tone: Toast["tone"] = "default") {
  toast = { id: nextId++, text, tone };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function Toaster() {
  const current = useSyncExternalStore(subscribe, () => toast, () => null);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => {
      if (toast?.id === current.id) {
        toast = null;
        emit();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [current]);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      {current && (
        <div
          key={current.id}
          className={`rounded-full px-5 py-2.5 text-caption font-medium shadow-lift transition-opacity duration-200 starting:opacity-0 ${
            current.tone === "error" ? "bg-danger text-white" : "bg-foreground text-background"
          }`}
        >
          {current.text}
        </div>
      )}
    </div>
  );
}
