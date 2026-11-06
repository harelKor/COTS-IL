"use client";

import { useEffect, useSyncExternalStore } from "react";

type Toast = { id: number; text: string; tone: "default" | "error"; action?: { label: string; run: () => void } };

let toast: Toast | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/**
 * Shows a short message at the bottom of the screen. A new one replaces the last.
 * An action (like Undo) keeps it up for 5 seconds instead of 3.
 */
export function showToast(text: string, tone: Toast["tone"] = "default", action?: Toast["action"]) {
  toast = { id: nextId++, text, tone, action };
  emit();
}

function dismiss(id: number) {
  if (toast?.id === id) {
    toast = null;
    emit();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function Toaster() {
  const current = useSyncExternalStore(subscribe, () => toast, () => null);

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => dismiss(current.id), current.action ? 5000 : 3000);
    return () => clearTimeout(timer);
  }, [current]);

  return (
    <div data-toasts aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      {current && (
        <div
          key={current.id}
          className={`pointer-events-auto flex items-center gap-4 rounded-full ps-5 py-1.5 text-caption font-medium shadow-lift transition-opacity duration-200 starting:opacity-0 ${
            current.tone === "error" ? "bg-danger text-white" : "bg-foreground text-background"
          } ${current.action ? "pe-2" : "pe-5"}`}
        >
          <span className="py-1">{current.text}</span>
          {current.action && (
            <button
              type="button"
              onClick={() => {
                current.action!.run();
                dismiss(current.id);
              }}
              className="h-9 rounded-full px-4 font-semibold text-brand hover:bg-white/10"
            >
              {current.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
