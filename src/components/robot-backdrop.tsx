"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { israelDay, photoOfTheDay, photoSrc, photoSrcSet, ROBOT_PHOTOS, type RobotSlot } from "@/domain/robot-photos";

/** How long each photo stays before the next fades in (only when a slot has more than one). */
const HOLD_MS = 14_000;

const noSubscribe = () => () => {};

const SIZES: Record<RobotSlot, string> = {
  hero: "(min-width: 1024px) min(82vh, 840px), 92vw",
  lower: "(min-width: 640px) min(48vw, 760px), 92vw",
};

/**
 * A 1690 Orbit robot behind the home page, in one of two slots: "hero" (the tall robot on the
 * right edge, beside the motto, its chassis running down behind the first vendor cards) and
 * "lower" (the compact robot on the left edge, behind the lower vendor cards and "גלו עוד").
 * The photos are prepared transparent (the robot sharp, the arena a blue texture that melts
 * away), and globals.css places, sizes, masks and tints each slot. Several photos in a slot start
 * on the photo of the day and crossfade every 14 s (1.6 s; never under reduced motion).
 * Decorative and hidden from assistive tech; absolutely placed, so nothing shifts as it loads.
 */
export function RobotBackdrop({ slot }: { slot: RobotSlot }) {
  const photos = ROBOT_PHOTOS[slot];
  const count = photos.length;
  // Today's photo on the client; the server renders the first (a date there would break the static render).
  const first = useSyncExternalStore(noSubscribe, () => photoOfTheDay(count, israelDay(new Date())), () => 0);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => !document.hidden && setStep((s) => s + 1), HOLD_MS);
    return () => clearInterval(timer);
  }, [count]);

  if (count === 0) return null;
  const active = (first + step) % count;
  // Only the photo fading out, the one in view and the next are in the page.
  const shown = count < 2 ? [active] : [...new Set([(active - 1 + count) % count, active, (active + 1) % count])].sort((a, b) => a - b);

  return (
    <div aria-hidden className={`robot-slot robot-slot-${slot} pointer-events-none absolute -z-10 overflow-hidden`}>
      {shown.map((i) => {
        const p = photos[i];
        return (
          <picture key={p.id}>
            <source type="image/avif" srcSet={photoSrcSet(p, "avif")} sizes={SIZES[slot]} />
            <source type="image/webp" srcSet={photoSrcSet(p, "webp")} sizes={SIZES[slot]} />
            <img
              src={photoSrc(p.id, p.widths[1] ?? p.widths[0], "webp")}
              alt=""
              width={p.width}
              height={p.height}
              decoding="async"
              loading={slot === "hero" ? "eager" : "lazy"}
              fetchPriority={slot === "hero" ? "high" : "low"}
              className={`robot-photo absolute inset-0 size-full object-contain ${i === active ? "opacity-100" : "opacity-0"}`}
            />
          </picture>
        );
      })}
      <div className="robot-wash absolute inset-0" />
    </div>
  );
}
