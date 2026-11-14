"use client";

import { useEffect } from "react";

/**
 * Light scroll parallax for the home photos (home-scene.tsx), one requestAnimationFrame per
 * scroll. It only writes two numbers on <html>, and globals.css turns them into GPU transforms
 * (on <html>, not on the photos: the lower photo streams in and may not be hydrated yet).
 * - --zoom, from the tall photo (data-parallax="zoom"): 0 → 1 as it scrolls away; the photo
 *   pushes in a little around the bumpers, so they never move toward the vendor cards.
 * - --drift, from the short photo (data-parallax="drift"): 1 → -1 as it crosses the window; the
 *   photo drifts slower than the page, like something further away.
 * Nothing at all under reduced motion.
 */
export function ScrollParallax() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement.style;
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      for (const el of document.querySelectorAll<HTMLElement>("[data-parallax]")) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) continue;
        if (el.dataset.parallax === "zoom") {
          root.setProperty("--zoom", Math.min(1, Math.max(0, -r.top / r.height)).toFixed(4));
        } else {
          root.setProperty("--drift", Math.min(1, Math.max(-1, (r.top + r.height / 2 - vh / 2) / vh)).toFixed(4));
        }
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      root.removeProperty("--zoom");
      root.removeProperty("--drift");
    };
  }, []);
  return null;
}
