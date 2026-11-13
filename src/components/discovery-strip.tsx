"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CardFamily } from "@/lib/catalog";
import { FamilyCard } from "./family-card";

/** How long each card stays before the row moves on, and how long a touch pauses it. */
const STEP_MS = 4000;
const TOUCH_PAUSE_MS = 8000;

/**
 * "גלו עוד": today's less common picks in one sideways row that moves on by itself, one card
 * at a time, and stops while a pointer is over it, something in it has focus, or after a touch.
 * Under reduced motion it never moves on its own. Every card keeps its one-tap "+".
 */
export function DiscoveryStrip({ cards, title = "גלו עוד", note = "כל יום מבחר אחר של חלקים שכדאי להכיר" }: { cards: CardFamily[]; title?: string; note?: string }) {
  const row = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = row.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let pausedUntil = 0;
    let hover = false;
    const onEnter = () => (hover = true);
    const onLeave = () => (hover = false);
    const onTouch = () => (pausedUntil = Date.now() + TOUCH_PAUSE_MS);
    el.addEventListener("pointerenter", onEnter);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("touchstart", onTouch, { passive: true });
    el.addEventListener("wheel", onTouch, { passive: true });
    const timer = setInterval(() => {
      if (hover || Date.now() < pausedUntil || document.hidden || el.contains(document.activeElement)) return;
      const card = el.querySelector("li");
      if (!card) return;
      const step = card.getBoundingClientRect().width + 12;
      // RTL: the row runs leftwards, scrollLeft goes from 0 to negative.
      const atEnd = Math.abs(el.scrollLeft) + el.clientWidth >= el.scrollWidth - 4;
      if (atEnd) el.scrollTo({ left: 0, behavior: "smooth" });
      else el.scrollBy({ left: getComputedStyle(el).direction === "rtl" ? -step : step, behavior: "smooth" });
    }, STEP_MS);
    return () => {
      clearInterval(timer);
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("touchstart", onTouch);
      el.removeEventListener("wheel", onTouch);
    };
  }, []);

  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="discover" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="discover" className="flex items-center gap-2 text-section font-semibold">
          <Sparkles size={20} strokeWidth={1.75} aria-hidden className="text-brand" />
          {title}
        </h2>
        <p className="text-caption text-muted">{note}</p>
      </div>
      <ul
        ref={row}
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pt-2 pb-6 sm:-mx-2 sm:px-2"
      >
        {cards.map((c, i) => (
          <FamilyCard
            key={c.id}
            family={c}
            className="discover-card w-[220px] shrink-0 snap-start sm:w-[240px]"
            style={{ "--d": `${Math.min(i, 8) * 70}ms` } as React.CSSProperties}
          />
        ))}
      </ul>
    </section>
  );
}
