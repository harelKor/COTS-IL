"use client";

import { useEffect, useId, useRef } from "react";
import { loopCards } from "@/domain/suggestions";
import type { CardFamily } from "@/lib/catalog";
import { FamilyCard } from "./family-card";
import { FireBadge } from "./fire-badge";

/** Seconds a card takes to slide past, so a longer row isn't faster. */
const SECONDS_PER_CARD = 5;

/**
 * A product's suggestions as a hot row: a warm glass panel with the flame badge, and its cards
 * sliding sideways forever (one transform animation on the track, globals.css "hot row"). The
 * track holds the cards twice and slides by one copy, so it never shows a seam. It stops while a
 * pointer is over it or something in it has focus, after a touch, and while it is off screen; under
 * reduced motion it is a still row that scrolls by hand. The second copy is hidden from screen
 * readers and the keyboard, so each part is announced once. Every card keeps its one-tap "+".
 */
export function HotRow({ title, cards }: { title: string; cards: CardFamily[] }) {
  const box = useRef<HTMLElement>(null);
  const id = useId();
  const { base, loops } = loopCards(cards);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const seen = new IntersectionObserver(([entry]) => el.toggleAttribute("data-offscreen", !entry.isIntersecting));
    seen.observe(el);
    // A touch holds the row still for a while, so a card can be read and tapped.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onTouch = () => {
      el.setAttribute("data-held", "");
      clearTimeout(timer);
      timer = setTimeout(() => el.removeAttribute("data-held"), 6000);
    };
    el.addEventListener("touchstart", onTouch, { passive: true });
    return () => {
      seen.disconnect();
      clearTimeout(timer);
      el.removeEventListener("touchstart", onTouch);
    };
  }, []);

  if (cards.length === 0) return null;
  const track = loops ? [...base, ...base] : base;
  return (
    <section ref={box} aria-labelledby={`${id}-h`} data-jump={title} className="hot-zone scroll-mt-32 relative flex flex-col gap-4 overflow-hidden rounded-card py-5 md:py-6">
      <h2 id={`${id}-h`} className="flex items-center gap-2.5 px-5 text-section font-semibold tracking-tight md:px-6 lg:text-[24px]">
        <FireBadge />
        {title}
      </h2>
      <div className={`hot-marquee ${loops ? "" : "overflow-x-auto"}`}>
        <ul
          className={`hot-track flex w-max gap-4 ms-5 pt-1 pb-8 md:ms-6 ${loops ? "is-looping" : ""}`}
          style={{ "--loop": `${base.length * SECONDS_PER_CARD}s` } as React.CSSProperties}
        >
          {track.map((c, i) => {
            const repeat = i >= cards.length;
            return (
              <FamilyCard
                key={`${i}:${c.id}`}
                family={c}
                morph={!repeat}
                glow
                inert={repeat}
                className={`hot-card w-[220px] shrink-0 sm:w-[250px] ${i >= base.length ? "hot-dup" : ""}`}
              />
            );
          })}
        </ul>
      </div>
    </section>
  );
}
