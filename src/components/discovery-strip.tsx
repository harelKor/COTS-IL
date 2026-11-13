"use client";

import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CardFamily } from "@/lib/catalog";
import { FamilyCard } from "./family-card";

/** How long each card stays before the row moves on, and how long a touch pauses it. */
const STEP_MS = 4000;
const TOUCH_PAUSE_MS = 8000;

/** The row's direction: forward is leftwards in RTL, where scrollLeft runs from 0 to negative. */
const forward = (el: HTMLElement) => (getComputedStyle(el).direction === "rtl" ? -1 : 1);

/**
 * "גלו עוד": today's less common picks in one sideways row. It moves on by itself, one card at
 * a time, and stops while a pointer is over the strip or its arrows, something in it has focus,
 * or after a touch; never under reduced motion. Arrows at both ends scroll about a screen of
 * cards and hide at the row's ends. Every card keeps its one-tap "+".
 */
export function DiscoveryStrip({ cards, title = "גלו עוד", note = "כל יום מבחר אחר של חלקים שכדאי להכיר" }: { cards: CardFamily[]; title?: string; note?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLUListElement>(null);
  const [ends, setEnds] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const offset = Math.abs(el.scrollLeft);
    setEnds({ start: offset < 4, end: offset + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  /** One screen of cards forward (1) or back (-1). */
  const page = (dir: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    el.scrollBy({ left: dir * forward(el) * el.clientWidth * 0.9, behavior: "smooth" });
  };

  useEffect(() => {
    const el = row.current;
    const box = wrap.current;
    if (!el || !box) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const cleanup = () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return cleanup;

    let pausedUntil = 0;
    let hover = false;
    const onEnter = () => (hover = true);
    const onLeave = () => (hover = false);
    const onTouch = () => (pausedUntil = Date.now() + TOUCH_PAUSE_MS);
    box.addEventListener("pointerenter", onEnter);
    box.addEventListener("pointerleave", onLeave);
    box.addEventListener("touchstart", onTouch, { passive: true });
    el.addEventListener("wheel", onTouch, { passive: true });
    const timer = setInterval(() => {
      if (hover || Date.now() < pausedUntil || document.hidden || box.contains(document.activeElement)) return;
      const card = el.querySelector("li");
      if (!card) return;
      const atEnd = Math.abs(el.scrollLeft) + el.clientWidth >= el.scrollWidth - 4;
      if (atEnd) el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollBy({ left: forward(el) * (card.getBoundingClientRect().width + 12), behavior: "smooth" });
    }, STEP_MS);
    return () => {
      cleanup();
      clearInterval(timer);
      box.removeEventListener("pointerenter", onEnter);
      box.removeEventListener("pointerleave", onLeave);
      box.removeEventListener("touchstart", onTouch);
      el.removeEventListener("wheel", onTouch);
    };
  }, [measure]);

  if (cards.length === 0) return null;
  const arrow =
    "btn-plus absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-brand transition-opacity duration-200 hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-brand";
  return (
    <section aria-labelledby="discover" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="discover" className="flex items-center gap-2 text-section font-semibold">
          <Sparkles size={20} strokeWidth={1.75} aria-hidden className="text-brand" />
          {title}
        </h2>
        <p className="text-caption text-muted">{note}</p>
      </div>
      <div ref={wrap} className="relative">
        <ul
          ref={row}
          className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto scroll-smooth px-4 pt-2 pb-6 sm:-mx-2 sm:scroll-px-2 sm:px-2"
        >
          {cards.map((c, i) => (
            <FamilyCard
              key={c.id}
              family={c}
              glow
              className="discover-card w-[220px] shrink-0 snap-start sm:w-[240px]"
              style={{ "--d": `${Math.min(i, 8) * 70}ms` } as React.CSSProperties}
            />
          ))}
        </ul>
        {/* RTL: "back" sits at the start (right) and points right, "more" at the end (left) and points left. */}
        <button
          type="button"
          aria-label="הקודמים"
          onClick={() => page(-1)}
          tabIndex={ends.start ? -1 : 0}
          aria-hidden={ends.start}
          className={`${arrow} -start-1 sm:-start-3 ${ends.start ? "pointer-events-none opacity-0" : "opacity-100"}`}
        >
          <ChevronRight size={20} strokeWidth={2} aria-hidden className="ltr:rotate-180" />
        </button>
        <button
          type="button"
          aria-label="עוד הצעות"
          onClick={() => page(1)}
          tabIndex={ends.end ? -1 : 0}
          aria-hidden={ends.end}
          className={`${arrow} -end-1 sm:-end-3 ${ends.end ? "pointer-events-none opacity-0" : "opacity-100"}`}
        >
          <ChevronLeft size={20} strokeWidth={2} aria-hidden className="ltr:rotate-180" />
        </button>
      </div>
    </section>
  );
}
