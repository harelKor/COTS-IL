"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * A long text shown to about its first screen, fading out over its last lines, with one centred
 * "קראו עוד" that opens the rest in place (PP4). Text that fits is shown whole, with no button.
 * The hidden part stays in the page, for search engines and screen readers.
 */
export function ReadMore({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [fits, setFits] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // A little over the clamp is shown whole: a button to reveal three lines is worse than the lines.
    const check = () => setFits(el.scrollHeight <= el.clientHeight + 96);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clamped = !open && !fits;
  return (
    <div className="flex flex-col">
      <div ref={box} data-clamped={clamped || undefined} className={`read-more ${open || fits ? "" : "max-h-[34rem] overflow-hidden"}`}>
        {children}
      </div>
      {clamped && (
        <div className="relative z-10 -mt-6 flex justify-center">
          <button type="button" onClick={() => setOpen(true)} className="btn-soft flex h-11 items-center gap-2 rounded-full px-6 text-callout font-medium">
            קראו עוד
            <ChevronDown size={18} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
