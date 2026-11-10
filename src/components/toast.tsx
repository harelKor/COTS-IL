"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

type Toast = { id: number; text: string; tone: "default" | "error"; action?: { label: string; run: () => void } };

/** Two at most: a new toast stacks on the last one instead of replacing it. */
const MAX_TOASTS = 2;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/**
 * Shows a short message at the bottom of the screen, above an open sheet too.
 * An action (like Undo) or an error keeps it up for 6 seconds instead of 3;
 * hovering or focusing it pauses the timer.
 */
export function showToast(text: string, tone: Toast["tone"] = "default", action?: Toast["action"]) {
  toasts = [...toasts, { id: nextId++, text, tone, action }].slice(-MAX_TOASTS);
  emit();
}

function dismiss(id: number) {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const noToasts: Toast[] = [];
const noSubscribe = () => () => {};

/**
 * The open modal <dialog>, if any. A modal makes the rest of the page inert, so
 * toasts render inside it (and in the top layer, as a popover) to stay visible
 * and clickable while the cart sheet or search panel is open.
 */
function useOpenModal() {
  const [modal, setModal] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    const find = () => {
      const open = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].filter((d) => d.matches(":modal"));
      setModal(open.at(-1) ?? null);
    };
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    return () => observer.disconnect();
  }, []);
  return modal;
}

function ToastItem({ toast }: { toast: Toast }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.action || toast.tone === "error" ? 6000 : 3000);

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const timer = setTimeout(() => dismiss(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(1000, remaining.current - (Date.now() - started));
    };
  }, [paused, toast.id]);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto flex max-w-full items-center gap-3 rounded-full ps-5 py-1 text-caption font-medium shadow-lift transition-opacity duration-200 starting:opacity-0 ${
        toast.tone === "error" ? "bg-danger text-white" : "bg-foreground text-background"
      } ${toast.action ? "pe-1" : "pe-5"}`}
    >
      <span className="py-2">{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action!.run();
            dismiss(toast.id);
          }}
          className="h-11 shrink-0 rounded-full px-4 font-semibold text-brand-soft hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-brand-soft"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

export function Toaster() {
  const current = useSyncExternalStore(subscribe, () => toasts, () => noToasts);
  const modal = useOpenModal();
  const box = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  // Into the top layer, above any open modal. Showing it again moves it to the top.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof el.showPopover !== "function") return;
    if (el.matches(":popover-open")) el.hidePopover();
    if (current.length > 0) el.showPopover();
  }, [current, modal, mounted]);

  if (!mounted) return null;
  return createPortal(
    <div
      ref={box}
      popover="manual"
      data-toasts
      aria-live="polite"
      // Above the cart sheet's pinned footer when it is open (--sheet-footer is set on the sheet).
      className="pointer-events-none fixed inset-x-0 top-auto bottom-[calc(var(--sheet-footer,5rem)+1rem)] m-0 flex w-full flex-col items-center gap-2 overflow-visible border-0 bg-transparent px-4 py-0"
    >
      {current.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>,
    modal ?? document.body,
  );
}
