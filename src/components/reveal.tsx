"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Plays a section's entrance once, as it scrolls into view (globals.css, `[data-reveal]`): the
 * content is in the page and visible from the start, and only a section still below the window when
 * the script runs is held back (data-reveal="wait") until it arrives ("in"). So without JS, under
 * reduced motion, or for a section already on screen, nothing is ever hidden. It waits for the
 * images inside a `data-reveal-wait` element (the photo) to be ready, briefly. Transforms and
 * opacity only: nothing moves the layout.
 */
export function Reveal({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    el.dataset.reveal = "wait";
    let gone = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        // The shown photo first (at most 700ms), so it rises in whole rather than popping in half way.
        const shown = [...el.querySelectorAll<HTMLImageElement>("[data-reveal-wait] img")].filter((img) => img.offsetParent !== null);
        const timeout = new Promise((done) => setTimeout(done, 700));
        void Promise.race([Promise.all(shown.map((img) => img.decode().catch(() => undefined))), timeout]).then(() => {
          if (!gone) el.dataset.reveal = "in";
        });
      },
      { rootMargin: "0px 0px -18% 0px" },
    );
    io.observe(el);
    return () => {
      gone = true;
      io.disconnect();
      if (el.dataset.reveal === "wait") delete el.dataset.reveal;
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
