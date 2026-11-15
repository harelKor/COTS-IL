"use client";

import { useEffect, useRef, useState } from "react";

type Section = { label: string; el: HTMLElement };

/** Smooth scrolling, unless the visitor asked for less motion. */
const behavior = (): ScrollBehavior => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

/**
 * The product page's jump bar (PP4): a slim glass bar under the header, shown once the buy box has
 * scrolled away, with a link to each section the page has (מפרט, תיעוד, סקירה, כל האפשרויות, the
 * suggestions). The sections mark themselves with `data-jump="<label>"`, so it lists only what's
 * there, including the suggestions when they stream in; the one in view is marked. On phones it
 * scrolls sideways. It reads the page it's in (its <article>), never another one Next keeps hidden.
 */
export function JumpBar() {
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState<HTMLElement | null>(null);

  // The sections there are, and whether the buy box is above the screen.
  useEffect(() => {
    const article = bar.current?.closest("article");
    if (!article) return;
    let frame = 0;
    const collect = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const els = [...article.querySelectorAll<HTMLElement>("[data-jump]")];
        setSections((prev) =>
          prev.length === els.length && prev.every((s, i) => s.el === els[i] && s.label === els[i].dataset.jump) ? prev : els.map((el) => ({ label: el.dataset.jump!, el })),
        );
      });
    };
    collect();
    const mo = new MutationObserver(collect);
    mo.observe(article, { childList: true, subtree: true });
    const box = article.querySelector("[data-buy-box]");
    const io = box ? new IntersectionObserver(([e]) => setShown(!e.isIntersecting && e.boundingClientRect.top < 0)) : null;
    if (box) io!.observe(box);
    return () => {
      cancelAnimationFrame(frame);
      mo.disconnect();
      io?.disconnect();
      setShown(false);
    };
  }, []);

  // The section in view: the last one whose top has passed a line a quarter down the screen
  // (under the bar), or at the very bottom of the page the last one that shows.
  useEffect(() => {
    if (sections.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = 128 + (window.innerHeight - 128) * 0.25;
      const tops = sections.map((s) => s.el.getBoundingClientRect().top);
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      let i = tops.findLastIndex((t) => t <= (atEnd ? window.innerHeight - 80 : line));
      if (i < 0) i = 0;
      setActive(sections[i].el);
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
    };
  }, [sections]);

  // On phones the marked link scrolls into the bar's view (sideways only, never the page).
  useEffect(() => {
    const ul = list.current;
    const btn = ul?.querySelector<HTMLElement>("[aria-current]");
    if (!ul || !btn || !shown || ul.scrollWidth <= ul.clientWidth) return;
    const a = btn.getBoundingClientRect();
    const b = ul.getBoundingClientRect();
    ul.scrollBy({ left: a.left + a.width / 2 - (b.left + b.width / 2), behavior: behavior() });
  }, [active, shown]);

  function go(s: Section) {
    setActive(s.el);
    s.el.scrollIntoView({ behavior: behavior(), block: "start" });
  }

  return (
    <nav
      ref={bar}
      aria-label="חלקי העמוד"
      data-shown={shown || undefined}
      aria-hidden={!shown || undefined}
      inert={!shown}
      className={`jump-bar fixed inset-x-0 top-[52px] z-20 border-b backdrop-blur-xl transition-[translate,opacity] duration-300 ease-out motion-reduce:transition-none print:hidden ${
        shown && sections.length > 1 ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0"
      }`}
    >
      <ul ref={list} className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:px-12">
        {sections.map((s) => (
          <li key={s.label} className="shrink-0">
            <button
              type="button"
              onClick={() => go(s)}
              aria-current={active === s.el ? "true" : undefined}
              className="jump-link relative flex h-11 items-center rounded-full px-4 text-callout font-medium whitespace-nowrap text-muted transition-colors duration-200 hover:text-foreground"
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
