"use client";

import { useEffect } from "react";

/**
 * The home photos' light scroll parallax (home-scene.tsx), for browsers without CSS scroll-driven
 * animations. Where `animation-timeline: view()` works (Chromium, Safari 26), globals.css does it
 * all on the compositor and this does nothing. Otherwise, one requestAnimationFrame per scroll
 * writes two numbers on the photo boxes themselves (never on <html>, which would restyle the whole
 * page every frame), and globals.css turns them into transforms:
 * - --zoom, on the hero photo (data-parallax="zoom"): 0 → 1 as it scrolls away; the photo
 *   pushes in a little around the bumpers, so they never move toward the vendor cards.
 * - --drift, on the lower photo (data-parallax="drift"): 1 → -1 as it crosses the window; the
 *   photo drifts slower than the page, like something further away.
 * The boxes are looked up each frame, so the lower photo counts as soon as it streams in.
 * Desktop only (1024px and up), and nothing at all under reduced motion.
 */
export function ScrollParallax() {
  useEffect(() => {
    if (CSS.supports("animation-timeline: view()")) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!desktop.matches) return;
      const vh = window.innerHeight;
      for (const el of document.querySelectorAll<HTMLElement>("[data-parallax]")) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) continue;
        if (el.dataset.parallax === "zoom") {
          el.style.setProperty("--zoom", Math.min(1, Math.max(0, -r.top / r.height)).toFixed(4));
        } else {
          el.style.setProperty("--drift", Math.min(1, Math.max(-1, (r.top + r.height / 2 - vh / 2) / vh)).toFixed(4));
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
      for (const el of document.querySelectorAll<HTMLElement>("[data-parallax]")) {
        el.style.removeProperty("--zoom");
        el.style.removeProperty("--drift");
      }
    };
  }, []);
  return null;
}
