"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { israelDay, photoOfTheDay, photoSrc, ROBOT_PHOTOS } from "@/domain/robot-photos";

/** Seconds each photo stays before the next fades in (only when there is more than one). */
const HOLD_MS = 14_000;

const noSubscribe = () => () => {};
/** Today's photo on the client; the server renders the first (a date there would break the static render). */
const todayIndex = () => photoOfTheDay(ROBOT_PHOTOS.length, israelDay(new Date()));

/**
 * The home page's backdrop: a 1690 Orbit robot on the right edge of the page (the start side in
 * RTL), behind the vendor boxes' top area. Pale and half see-through, its inner and bottom edges
 * fade into the page, and an Orbit wash (royal blue, a hint of the LED purple) blends it into the
 * area around it. With more photos it starts on the photo of the day and crossfades to the next
 * every 14 s (1.6 s fade; never under reduced motion). Decorative, hidden from assistive tech,
 * absolutely placed so nothing moves when it loads. A smaller, fainter band on phones.
 */
export function RobotBackdrop() {
  const first = useSyncExternalStore(noSubscribe, todayIndex, () => 0);
  const [step, setStep] = useState(0);
  const count = ROBOT_PHOTOS.length;

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => !document.hidden && setStep((s) => s + 1), HOLD_MS);
    return () => clearInterval(timer);
  }, [count]);

  const active = (first + step) % Math.max(count, 1);
  // Only the photo fading out, the one in view and the next are in the page: later photos load just before they show.
  const shown = count < 2 ? [active] : [...new Set([(active - 1 + count) % count, active, (active + 1) % count])].sort((a, b) => a - b);

  return (
    <div aria-hidden className="robot-backdrop pointer-events-none absolute top-0 start-0 -z-10 overflow-hidden">
      {shown.map((i) => {
        const p = ROBOT_PHOTOS[i];
        return (
          <picture key={p.id}>
            <source type="image/avif" srcSet={`${photoSrc(p.id, 640, "avif")} 640w, ${photoSrc(p.id, 960, "avif")} 960w`} sizes="(min-width: 640px) 46vw, 72vw" />
            <source type="image/webp" srcSet={`${photoSrc(p.id, 640, "webp")} 640w, ${photoSrc(p.id, 960, "webp")} 960w`} sizes="(min-width: 640px) 46vw, 72vw" />
            <img
              src={photoSrc(p.id, 960, "webp")}
              alt=""
              decoding="async"
              fetchPriority="low"
              style={{ "--focus": p.focus } as React.CSSProperties}
              className={`robot-photo absolute inset-0 size-full object-cover ${i === active ? "opacity-100" : "opacity-0"}`}
            />
          </picture>
        );
      })}
      <div className="robot-wash absolute inset-0" />
    </div>
  );
}
