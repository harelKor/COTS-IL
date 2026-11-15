"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FireBadge } from "./fire-badge";

/**
 * "הכי מבוקשים": a heading on a hairline, open at first. The title itself (badge and text) and the
 * glass "הסתר"/"הצג" pill both open and close the cards under it. The cards grow and shrink in
 * 300 ms (none under reduced motion) and are clipped only while closed or moving, so their glow
 * isn't cut off when open.
 */
export function PopularSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const [clip, setClip] = useState(false);
  const id = useId();
  const box = useRef<HTMLElement>(null);

  // The flame and the cards' heat glow pause while the section is off screen (data-offscreen, globals.css).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const seen = new IntersectionObserver(([entry]) => el.toggleAttribute("data-offscreen", !entry.isIntersecting));
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  const toggle = () => {
    const next = !open;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Opening: clipped until it has grown (transitionend), or at once when nothing animates.
    setClip(reduced ? !next : true);
    setOpen(next);
  };
  const control = { "aria-expanded": open, "aria-controls": `${id}-panel`, onClick: toggle } as const;

  return (
    <section ref={box} aria-labelledby={`${id}-h`} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 id={`${id}-h`} className="min-w-0">
          <button
            type="button"
            {...control}
            className="flex min-h-11 items-center gap-2.5 rounded-xl text-start text-section font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-brand lg:text-[24px]"
          >
            <FireBadge />
            הכי מבוקשים
          </button>
        </h2>
        <span aria-hidden className="section-rule h-px min-w-6 flex-1" />
        <button
          type="button"
          {...control}
          tabIndex={-1}
          className="glass-pill flex min-h-11 shrink-0 items-center gap-1.5 rounded-full ps-4 pe-3 text-caption font-medium"
        >
          {open ? "הסתר" : "הצג"}
          <ChevronDown
            size={20}
            strokeWidth={1.75}
            aria-hidden
            className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>
      <div
        id={`${id}-panel`}
        inert={!open}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === "grid-template-rows" && open) setClip(false);
        }}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className={`min-h-0 ${clip || !open ? "overflow-hidden" : ""}`}>{children}</div>
      </div>
    </section>
  );
}
