"use client";

import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { DiscoverPage } from "@/app/api/discover/route";
import type { CardFamily } from "@/lib/catalog";
import { aliveStyle } from "@/domain/alive";
import { SectionHeading } from "./section-heading";
import { FamilyCard } from "./family-card";

/** How long each card stays before the row moves on, and how long a touch pauses it. */
const STEP_MS = 4000;
const TOUCH_PAUSE_MS = 8000;
/** Pages kept in the DOM; past this the far end is dropped (the strip recycles its cards). */
const MAX_PAGES = 4;

/** The row's direction: forward is leftwards in RTL, where scrollLeft runs from 0 to negative. */
const forward = (el: HTMLElement) => (getComputedStyle(el).direction === "rtl" ? -1 : 1);

type Page = { p: number; cards: CardFamily[] };
type Anchor = { key: string; left: number };

/**
 * "גלו עוד": today's less common picks in an endless row. More pages load from /api/discover as it
 * nears either end (pages wrap around, so a part repeats only after the whole pool), the far end
 * is dropped past 4 pages, and the cards in view never move when that happens. It moves on by
 * itself, one card at a time, and stops while a pointer is over the strip or its arrows, something
 * in it has focus, or after a touch; never under reduced motion. Every card keeps its one-tap "+".
 */
export function DiscoveryStrip({
  cards,
  pages: pageTotal,
  vendor,
  title = "גלו עוד",
  note = "כל יום מבחר אחר של חלקים שכדאי להכיר",
}: {
  cards: CardFamily[];
  pages: number;
  /** A supplier code, or "" for every vendor. */
  vendor: string;
  title?: string;
  note?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLUListElement>(null);
  const [pages, setPages] = useState<Page[]>([{ p: 0, cards }]);
  const loading = useRef(false);
  const anchor = useRef<Anchor | null>(null);
  /** The pages as last set, read by the loaders (state can lag a render behind). */
  const live = useRef(pages);

  /** The first card in view and where it is, so it can be put back after the list changes. */
  const takeAnchor = () => {
    const el = row.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    for (const li of el.querySelectorAll<HTMLElement>("li[data-key]")) {
      const r = li.getBoundingClientRect();
      if (r.right > box.left && r.left < box.right) {
        anchor.current = { key: li.dataset.key!, left: r.left };
        return;
      }
    }
  };

  // Puts the anchored card back where it was, before the browser paints: nothing visibly moves.
  useLayoutEffect(() => {
    const el = row.current;
    const a = anchor.current;
    anchor.current = null;
    if (!el || !a) return;
    const li = el.querySelector<HTMLElement>(`li[data-key="${CSS.escape(a.key)}"]`);
    if (!li) return;
    const d = li.getBoundingClientRect().left - a.left;
    if (Math.abs(d) < 0.5) return;
    el.style.scrollBehavior = "auto";
    el.scrollLeft += d;
    el.style.scrollBehavior = "";
  }, [pages]);

  /** Loads the page after the last (end) or before the first (start), dropping the far end past MAX_PAGES. */
  const load = useCallback(
    async (side: "start" | "end") => {
      if (loading.current) return;
      loading.current = true;
      try {
        const now = live.current;
        const p = side === "end" ? now[now.length - 1].p + 1 : now[0].p - 1;
        const res = await fetch(`/api/discover?vendor=${encodeURIComponent(vendor)}&page=${p}`);
        if (!res.ok) return;
        const body = (await res.json()) as DiscoverPage;
        if (body.cards.length === 0) return;
        takeAnchor();
        const prev = live.current;
        const all = side === "end" ? [...prev, { p, cards: body.cards }] : [{ p, cards: body.cards }, ...prev];
        const next = all.length <= MAX_PAGES ? all : side === "end" ? all.slice(all.length - MAX_PAGES) : all.slice(0, MAX_PAGES);
        live.current = next;
        setPages(next);
      } catch {
        // Offline or a hiccup: the next scroll near the end tries again.
      } finally {
        loading.current = false;
      }
    },
    [vendor],
  );

  /** Loads more when the row is within about a screen and a half of either end. */
  const check = useCallback(() => {
    const el = row.current;
    if (!el || pageTotal < 1) return;
    const offset = Math.abs(el.scrollLeft);
    const left = el.scrollWidth - offset - el.clientWidth;
    if (left < el.clientWidth * 1.5) void load("end");
    else if (offset < el.clientWidth * 0.5 && live.current[0].p > -10_000) void load("start");
  }, [load, pageTotal]);

  /** One screen of cards forward (1) or back (-1); at the very start it first loads what comes before. */
  const page = async (dir: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    if (dir === -1 && Math.abs(el.scrollLeft) < el.clientWidth) await load("start");
    el.scrollBy({ left: dir * forward(el) * el.clientWidth * 0.9, behavior: "smooth" });
  };

  useEffect(() => {
    const el = row.current;
    const box = wrap.current;
    if (!el || !box) return;
    // Only after the visitor scrolls: the first page needs nothing more until then.
    const onScroll = () => check();
    el.addEventListener("scroll", onScroll, { passive: true });
    const cleanup = () => el.removeEventListener("scroll", onScroll);
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
      el.scrollBy({ left: forward(el) * (card.getBoundingClientRect().width + 12), behavior: "smooth" });
    }, STEP_MS);
    return () => {
      cleanup();
      clearInterval(timer);
      box.removeEventListener("pointerenter", onEnter);
      box.removeEventListener("pointerleave", onLeave);
      box.removeEventListener("touchstart", onTouch);
      el.removeEventListener("wheel", onTouch);
    };
  }, [check]);

  if (cards.length === 0) return null;
  // A wrapped strip can hold a family twice: only its first card takes the photo's morph name.
  const firstOf = new Map<string, string>();
  for (const { p, cards: list } of pages) for (const c of list) if (!firstOf.has(c.id)) firstOf.set(c.id, `${p}:${c.id}`);
  const arrow =
    "strip-arrow absolute top-1/2 z-10 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-brand md:flex";
  return (
    <section aria-labelledby="discover" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <SectionHeading id="discover" icon={<Sparkles size={20} strokeWidth={1.75} />}>
          {title}
        </SectionHeading>
        <p className="text-caption text-muted">{note}</p>
      </div>
      <div ref={wrap} className="relative">
        <ul
          ref={row}
          className="no-scrollbar scroll-fade-x -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto scroll-smooth px-4 pt-2 pb-6 sm:-mx-2 sm:scroll-px-6 sm:px-6"
        >
          {pages.flatMap(({ p, cards: list }) =>
            list.map((c, i) => (
              <FamilyCard
                key={`${p}:${c.id}`}
                dataKey={`${p}:${c.id}`}
                family={c}
                morph={firstOf.get(c.id) === `${p}:${c.id}`}
                glow
                className="discover-card min-h-[360px] w-[220px] shrink-0 snap-start pb-4 sm:w-[240px]"
                style={{ "--d": `${Math.min(i, 8) * 70}ms`, ...aliveStyle(`${p}:${c.id}`) } as React.CSSProperties}
              />
            )),
          )}
        </ul>
        {/* The row has no end, so both arrows always show from 768px (phones swipe). RTL: "back" at the start (right) points right. */}
        <button type="button" aria-label="הקודמים" onClick={() => void page(-1)} className={`${arrow} -start-1 sm:-start-3`}>
          <ChevronRight size={20} strokeWidth={2} aria-hidden className="ltr:rotate-180" />
        </button>
        <button type="button" aria-label="עוד הצעות" onClick={() => void page(1)} className={`${arrow} -end-1 sm:-end-3`}>
          <ChevronLeft size={20} strokeWidth={2} aria-hidden className="ltr:rotate-180" />
        </button>
      </div>
    </section>
  );
}
