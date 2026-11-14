"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A header disclosure menu (T18): a button and a popover panel under the header. The browser's
 * popover does the hard parts: Escape and a tap outside close it, focus goes back to the button,
 * the panel follows the button in the tab order, and opening one menu closes the others.
 *
 * Placement: `start` lines the panel's start (right) edge up with the button's, `end` its end
 * (left) edge, `center` centres it on the window; it always stays 16px inside the window.
 * A link inside closes the menu, since a client-side navigation keeps the header (and the open popover).
 */
export function HeaderMenu({
  id,
  label,
  trigger,
  triggerClassName,
  panelClassName = "",
  width,
  align = "start",
  chevron = true,
  children,
}: {
  id: string;
  /** The button's accessible name; it must contain the button's visible text. */
  label: string;
  trigger: ReactNode;
  triggerClassName: string;
  panelClassName?: string;
  /** The panel's width in px; narrower windows get the window less 32px. */
  width: number;
  align?: "start" | "end" | "center";
  chevron?: boolean | string;
  children: ReactNode;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const place = (e: Event) => {
      if ((e as ToggleEvent).newState !== "open" || !button.current) return;
      const vw = document.documentElement.clientWidth;
      const w = Math.min(width, vw - 32);
      const r = button.current.getBoundingClientRect();
      const header = button.current.closest("header")?.getBoundingClientRect();
      const clamp = (x: number) => Math.max(16, Math.min(x, vw - 16 - w));
      el.style.width = `${w}px`;
      el.style.top = `${Math.round((header?.bottom ?? r.bottom) + 8)}px`;
      el.style.insetInlineStart = "";
      el.style.insetInlineEnd = "";
      // The site is right-to-left: the inline start is the window's right edge.
      if (align === "start") el.style.insetInlineStart = `${clamp(vw - r.right)}px`;
      else if (align === "end") el.style.insetInlineEnd = `${clamp(r.left)}px`;
      else el.style.insetInlineStart = `${Math.round((vw - w) / 2)}px`;
    };
    const toggle = (e: Event) => setOpen((e as ToggleEvent).newState === "open");
    el.addEventListener("beforetoggle", place);
    el.addEventListener("toggle", toggle);
    return () => {
      el.removeEventListener("beforetoggle", place);
      el.removeEventListener("toggle", toggle);
    };
  }, [align, width]);

  return (
    <>
      <button
        ref={button}
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        className={triggerClassName}
      >
        {trigger}
        {chevron && (
          <ChevronDown
            size={16}
            strokeWidth={2}
            aria-hidden
            className={`shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""} ${typeof chevron === "string" ? chevron : ""}`}
          />
        )}
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        onClick={(e) => {
          if ((e.target as Element).closest("a")) panel.current?.hidePopover();
        }}
        className={`header-menu fixed inset-auto m-0 max-h-[calc(100dvh-76px)] overflow-y-auto overscroll-contain rounded-card border border-line bg-surface p-2 text-callout text-foreground shadow-lift ${panelClassName}`}
      >
        {children}
      </div>
    </>
  );
}
