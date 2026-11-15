"use client";

import { ChevronDown, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { shopifyImage } from "@/lib/images";
import { placeUnder } from "./anchored-popover";

export type FlyoutItem = { slug: string; name: string; count: number; image?: string | null; href: string; current?: boolean };

/** Hover intent: how long the pointer rests before a closed flyout opens, and how long it may be away before it closes. */
const OPEN_MS = 70;
const CLOSE_MS = 160;
/** How many flyouts are open: moving from one trigger to the next then switches at once. */
let openCount = 0;

/**
 * A group's dark-glass flyout of categories (WCP style), shared by the store's category cards and
 * the category bar on /catalog and in the stores. The trigger is a link to the whole group: a click
 * goes there in one step. With a mouse, resting on the trigger drops the flyout right under it; the
 * flyout's transparent top padding is the 8px bridge that keeps the hover alive on the way down.
 * On touch the first tap opens the flyout (its first row is "הכל ב…", the group itself) and a
 * second tap on the trigger goes to the group. The chevron button is the keyboard and screen-reader
 * way in: a disclosure (aria-expanded) whose panel follows it in the tab order; Escape closes it and
 * puts focus back on the button.
 *
 * The panel is a popover in the browser's top layer, placed with fixed coordinates (placeUnder), so
 * opening it moves nothing on the page and no scrolling row clips it. It closes when the page
 * scrolls. Everything in it comes from data the page already has: no request on hover.
 */
export function CategoryFlyout({
  id,
  href,
  label,
  allLabel,
  allCount,
  items,
  trigger,
  triggerClassName,
  triggerProps,
  toggleClassName,
  className = "",
  width = 340,
}: {
  id: string;
  /** The whole group. */
  href: string;
  /** The group's name, for the button's and the panel's accessible names. */
  label: string;
  /** The first row, to the whole group ("הכל בחשמל ובקרה"). */
  allLabel: ReactNode;
  allCount: number;
  items: FlyoutItem[];
  trigger: ReactNode;
  triggerClassName: string;
  triggerProps?: { "aria-current"?: "page" | "true" };
  /** The chevron button's look and place. */
  toggleClassName: string;
  className?: string;
  width?: number;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Opened by the chevron (a click or the keyboard): then leaving it with the mouse doesn't close it. */
  const pinned = useRef(false);
  /** The pointer of the last press on the trigger, and whether the flyout was open then (a tap outside closes it before the click). */
  const press = useRef<{ type: string; wasOpen: boolean }>({ type: "mouse", wasOpen: false });

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = () => {
    const el = panel.current;
    if (el && !el.matches(":popover-open")) el.showPopover();
  };
  const hide = () => {
    const el = panel.current;
    if (el?.matches(":popover-open")) el.hidePopover();
  };

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const close = () => {
      if (el.matches(":popover-open")) el.hidePopover();
    };
    const place = (e: Event) => {
      if ((e as ToggleEvent).newState === "open" && anchor.current) placeUnder(anchor.current, el, width);
    };
    const onScroll = (e: Event) => {
      if (!el.contains(e.target as Node)) close();
    };
    // Read from the element, not the event: quick opens and closes can arrive as one coalesced event.
    const toggle = () => {
      const now = el.matches(":popover-open");
      setOpen(now);
      if (now === openRef.current) return;
      openRef.current = now;
      openCount += now ? 1 : -1;
      if (!now) pinned.current = false;
      if (now) {
        window.addEventListener("scroll", onScroll, { capture: true, passive: true });
        window.addEventListener("resize", close);
      } else {
        window.removeEventListener("scroll", onScroll, { capture: true });
        window.removeEventListener("resize", close);
      }
    };
    el.addEventListener("beforetoggle", place);
    el.addEventListener("toggle", toggle);
    return () => {
      el.removeEventListener("beforetoggle", place);
      el.removeEventListener("toggle", toggle);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", close);
      if (openRef.current) openCount -= 1;
      openRef.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [width]);

  // The panel sits inside the anchor in the DOM (only its box is in the top layer), so hovering the
  // panel counts as hovering the anchor: moving from one to the other never fires pointerleave.
  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clear();
    if (openRef.current) return;
    timer.current = setTimeout(show, openCount > 0 ? 0 : OPEN_MS);
  };
  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || pinned.current) return;
    clear();
    timer.current = setTimeout(hide, CLOSE_MS);
  };

  return (
    <div ref={anchor} className={`relative ${className}`} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <Link
        href={href}
        {...triggerProps}
        onPointerDown={(e) => {
          press.current = { type: e.pointerType, wasOpen: openRef.current };
        }}
        onClick={(e) => {
          // A click cancels a hover that hasn't opened the flyout yet. A tap (not a mouse click) on a closed flyout opens it first.
          clear();
          if (press.current.type !== "mouse" && !press.current.wasOpen && items.length > 1) {
            e.preventDefault();
            show();
          } else hide();
        }}
        className={triggerClassName}
      >
        {trigger}
      </Link>
      <button
        ref={button}
        type="button"
        onClick={() => {
          // Not popoverTarget: a hover may have opened the flyout a moment before this click, which should keep it open.
          clear();
          if (openRef.current && pinned.current) hide();
          else {
            pinned.current = true;
            show();
          }
        }}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`הקטגוריות ב${label}`}
        className={toggleClassName}
      >
        <ChevronDown size={18} strokeWidth={2} aria-hidden className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="group"
        aria-label={label}
        className="flyout"
        onClick={(e) => {
          // A client-side navigation keeps the page mounted, and the popover open with it.
          if ((e.target as Element).closest("a")) hide();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            hide();
            button.current?.focus();
          }
        }}
      >
        <div className="flyout-panel">
          <Link href={href} className="flyout-row flyout-all">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flyout-title text-callout font-semibold">{allLabel}</span>
              <span className="text-caption text-muted tabular-nums">{allCount.toLocaleString("he-IL")} מוצרים</span>
            </span>
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden className="flyout-chevron shrink-0" />
          </Link>
          <ul className="flex flex-col">
            {items.map((c) => (
              <li key={c.slug}>
                <Link href={c.href} aria-current={c.current ? "page" : undefined} className="flyout-row">
                  <span className="tile-fade flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg p-1">
                    {c.image && (
                      // Hot-linked from the supplier's CDN, like every catalog photo. Fetched with the page at low
                      // priority (not lazily), so a hover makes no request and the flyout opens with its photos.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img {...shopifyImage(c.image, 48)} alt="" fetchPriority="low" decoding="async" referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
                    )}
                  </span>
                  <span className="flyout-title min-w-0 flex-1 truncate text-callout font-medium">{c.name}</span>
                  <span className="shrink-0 text-caption text-muted tabular-nums">{c.count.toLocaleString("he-IL")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
