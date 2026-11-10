"use client";

import { ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * A row of chips that scrolls sideways. Both edges fade, and while more chips are hidden
 * past the end an arrow says so (and scrolls on a tap), so a row that overflows reads as one.
 */
export function ScrollRow({ label, className = "", children }: { label?: string; className?: string; children: React.ReactNode }) {
  const row = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    // scrollLeft runs from 0 toward negative in RTL, so its size is how far along the row is.
    const update = () => setMore(el.scrollWidth - el.clientWidth - Math.abs(el.scrollLeft) > 8);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  function next() {
    const el = row.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollBy({ left: (rtl ? -1 : 1) * el.clientWidth * 0.7, behavior: "smooth" });
  }

  return (
    <div className={`relative -mx-6 md:-mx-12 ${className}`}>
      <div ref={row} role={label ? "navigation" : undefined} aria-label={label} className="no-scrollbar scroll-fade-x flex gap-2 overflow-x-auto px-6 pb-1 md:px-12">
        {children}
      </div>
      {more && (
        <button
          type="button"
          onClick={next}
          tabIndex={-1}
          aria-hidden
          className="absolute end-1 top-0 flex size-11 items-center justify-center md:end-6"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-surface text-foreground shadow-card ring-1 ring-line">
            <ChevronLeft size={18} strokeWidth={2} className="ltr:rotate-180" />
          </span>
        </button>
      )}
    </div>
  );
}
