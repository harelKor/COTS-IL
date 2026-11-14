"use client";

import { ChevronDown, Flame } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { SectionHeading } from "./section-heading";

/**
 * "הכי מבוקשים": a heading on a hairline, with a glass "הסתר"/"הצג" pill that opens and closes the
 * cards under it (open at first). The cards grow and shrink in 300 ms (none under reduced motion)
 * and are clipped only while closed or moving, so their glow isn't cut off when open.
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
    <section aria-labelledby={`${id}-h`} className="flex flex-col gap-4">
      <SectionHeading
        id={`${id}-h`}
        icon={<Flame size={20} strokeWidth={2} className="popular-flame" />}
        aside={
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-panel`}
            onClick={toggle}
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
        }
      >
        הכי מבוקשים
      </SectionHeading>
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
