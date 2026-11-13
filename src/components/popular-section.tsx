"use client";

import { ChevronDown, Flame } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/**
 * "הכי מבוקשים": a bold heading that opens and closes the cards under it (open at first).
 * The whole heading is the 44px toggle; the cards grow and shrink in 300 ms (none under reduced
 * motion) and are clipped only while closed or moving, so their glow isn't cut off when open.
 */
export function PopularSection({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  const [clip, setClip] = useState(false);
  const id = useId();

  const toggle = () => {
    const next = !open;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Opening: clipped until it has grown (transitionend), or at once when nothing animates.
    setClip(reduced ? !next : true);
    setOpen(next);
  };

  return (
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-3">
      <h2 id={`${id}-h`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={toggle}
          className="group flex min-h-11 w-full items-center gap-2.5 rounded-xl text-start focus-visible:outline-2 focus-visible:outline-brand"
        >
          <span className="popular-flame flex size-10 shrink-0 items-center justify-center rounded-full btn-brand" aria-hidden>
            <Flame size={20} strokeWidth={2} />
          </span>
          <span className="text-brand-gradient text-[28px] leading-tight font-semibold tracking-tight sm:text-[32px]">הכי מבוקשים</span>
          <ChevronDown
            size={20}
            strokeWidth={2}
            aria-hidden
            className={`ms-auto shrink-0 text-brand transition-transform duration-300 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h2>
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
