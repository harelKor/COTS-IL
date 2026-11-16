"use client";

import { ChevronDown, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { shopifyImage } from "@/lib/images";
import { fitToRoom, placeUnder } from "./anchored-popover";
import { countOf, PRODUCT } from "@/domain/plural";

export type FlyoutItem = { slug: string; name: string; count: number; image?: string | null; href: string; current?: boolean };

/** A click on one of the flyout's links (or the bar's trigger link): the catalog browser may take it over (catalog-nav.tsx). */
export type FlyoutNavigate = (e: React.MouseEvent, href: string) => void;

/** Phones: under 640px a group's categories open inline, in the page, not in a floating flyout. */
const NARROW = "(max-width: 639.98px)";
const subscribeNarrow = (on: () => void) => {
  const m = window.matchMedia(NARROW);
  m.addEventListener("change", on);
  return () => m.removeEventListener("change", on);
};
/** Whether the window is phone-narrow (false on the server and in the first render). */
export function useNarrow() {
  return useSyncExternalStore(subscribeNarrow, () => window.matchMedia(NARROW).matches, () => false);
}

/**
 * On a phone the trigger is an inline disclosure instead: the parent renders the categories
 * (FlyoutList in InlineFlyout) in the page, under the trigger's row, where they push the rest down,
 * scroll with the page and are never cut off by the browser's toolbars. A floating panel there
 * covered the other cards and lost its bottom under iPhone Safari's toolbar.
 */
export type InlineDisclosure = { expanded: boolean; controls: string; onToggle: (trigger: HTMLElement) => void };

/** Hover intent: how long the pointer rests before a closed flyout opens, and how long it may be away before it closes. */
const OPEN_MS = 70;
const CLOSE_MS = 160;
/** How many flyouts are open: moving from one trigger to the next then switches at once. */
let openCount = 0;

/**
 * A group's dark-glass flyout of categories (WCP style), shared by the store's group cards and the
 * category bar on /catalog and in the stores. It is wide, its rows tall (a photo, the name, the
 * count) and in two columns from 640px, so a group's categories show without a scroll box; its
 * first row, "הכל ב…", is the whole group.
 *
 * Two kinds of trigger:
 * - `mode="button"` (the store's group cards): the card is a disclosure button. A click or a tap
 *   opens the flyout and pins it open until a click anywhere else, Escape, or the same card again.
 *   With a mouse, resting on the card previews it. Enter and Space toggle it.
 * - `mode="link"` (the bar): the trigger is a link to the whole group, one click away. With a mouse,
 *   resting on it drops the flyout; on touch the first tap opens it and a second goes to the group.
 *   A chevron button beside it is the keyboard's disclosure, and a click on it pins the flyout.
 * Either way, the flyout's transparent top padding is an 8px bridge that keeps the hover alive on
 * the way down, its panel follows the trigger in the tab order, and Escape closes it and puts focus
 * back on the button.
 *
 * The panel is a popover in the browser's top layer, placed with fixed coordinates (placeUnder,
 * then fitToRoom opens it upward when there's no room under the trigger), so opening it moves
 * nothing on the page and no scrolling row clips it. It closes when the page scrolls. Everything in
 * it comes from data the page already has: no request on hover.
 */
export function CategoryFlyout({
  id,
  mode = "link",
  href,
  label,
  allLabel,
  allCount,
  items,
  trigger,
  triggerClassName,
  triggerProps,
  toggleClassName = "",
  className = "",
  width = 560,
  onNavigate,
  inline,
  within,
}: {
  id: string;
  mode?: "link" | "button";
  /** The whole group: the link trigger's target and the "הכל ב…" row's. */
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
  /** The link trigger's chevron button: its look and place. */
  toggleClassName?: string;
  className?: string;
  width?: number;
  onNavigate?: FlyoutNavigate;
  /** Phones: open in the page (see InlineDisclosure); the popover and the hover then stay off. */
  inline?: InlineDisclosure;
  /** A CSS selector for an ancestor the panel must stay within, sideways (placeUnder). */
  within?: string;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Opened by a click, a tap or the keyboard: then leaving it with the mouse doesn't close it. */
  const pinned = useRef(false);
  /** The pointer of the last press on a link trigger, and whether the flyout was open then (a tap outside closes it before the click). */
  const press = useRef<{ type: string; wasOpen: boolean }>({ type: "mouse", wasOpen: false });

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  /** Until when a page scroll is our own (fitToRoom making room) and mustn't close the flyout. */
  const quietUntil = useRef(0);
  /** Opens the flyout; a click (`pin`) may scroll the page so all of it fits under the trigger. */
  const show = (pin = false) => {
    const el = panel.current;
    if (!el || el.matches(":popover-open")) return;
    el.showPopover();
    // Open now, so it can be measured; moved before the browser paints.
    if (anchor.current && fitToRoom(anchor.current, el, pin)) quietUntil.current = performance.now() + 400;
  };
  const hide = () => {
    const el = panel.current;
    if (el?.matches(":popover-open")) el.hidePopover();
  };
  /**
   * A click on the card or the chevron. A press outside an open popover closes it before the click
   * lands (light dismiss), but openRef still holds the state from before the press: so a pinned
   * flyout closes, and one the hover had opened is opened again and pinned.
   */
  const toggle = () => {
    clear();
    // The element itself too: two quick key presses come before the toggle event updates openRef.
    if ((openRef.current || panel.current?.matches(":popover-open")) && pinned.current) hide();
    else {
      pinned.current = true;
      show(true);
    }
  };

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const close = () => {
      if (el.matches(":popover-open")) el.hidePopover();
    };
    const place = (e: Event) => {
      if ((e as ToggleEvent).newState === "open" && anchor.current) placeUnder(anchor.current, el, width, within ? anchor.current.closest(within)?.getBoundingClientRect() : null);
    };
    const onScroll = (e: Event) => {
      if (!el.contains(e.target as Node) && performance.now() > quietUntil.current) close();
    };
    // Read from the element, not the event: quick opens and closes can arrive as one coalesced event.
    const sync = () => {
      const now = el.matches(":popover-open");
      setOpen(now);
      if (now === openRef.current) return;
      openRef.current = now;
      openCount += now ? 1 : -1;
      if (now) {
        window.addEventListener("scroll", onScroll, { capture: true, passive: true });
        window.addEventListener("resize", close);
      } else {
        pinned.current = false;
        window.removeEventListener("scroll", onScroll, { capture: true });
        window.removeEventListener("resize", close);
      }
    };
    el.addEventListener("beforetoggle", place);
    el.addEventListener("toggle", sync);
    return () => {
      el.removeEventListener("beforetoggle", place);
      el.removeEventListener("toggle", sync);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", close);
      if (openRef.current) openCount -= 1;
      openRef.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [width, within]);

  // The panel sits inside the anchor in the DOM (only its box is in the top layer), so hovering the
  // panel counts as hovering the anchor: moving from one to the other never fires pointerleave.
  const onPointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || inline) return;
    clear();
    if (openRef.current) return;
    timer.current = setTimeout(() => show(), openCount > 0 ? 0 : OPEN_MS);
  };
  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || pinned.current || inline) return;
    clear();
    timer.current = setTimeout(hide, CLOSE_MS);
  };

  const expanded = inline ? inline.expanded : open;
  const controls = inline ? inline.controls : id;
  const onButton = () => (inline ? inline.onToggle(anchor.current!) : toggle());
  const chevron = (
    <ChevronDown size={18} strokeWidth={2} aria-hidden className={`transition-transform duration-200 ease-out motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`} />
  );

  return (
    <div ref={anchor} className={`relative ${className}`} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      {mode === "button" ? (
        <button ref={button} type="button" onClick={onButton} aria-expanded={expanded} aria-controls={controls} className={triggerClassName}>
          {trigger}
        </button>
      ) : (
        <>
          <Link
            href={href}
            {...triggerProps}
            onPointerDown={(e) => {
              press.current = { type: e.pointerType, wasOpen: openRef.current };
            }}
            onClick={(e) => {
              // A click cancels a hover that hasn't opened the flyout yet. A tap (not a mouse click) on a closed flyout opens it first.
              clear();
              if (inline) {
                // A phone: the first tap opens the categories in the page, a second goes to the group (and closes them).
                if (!inline.expanded && items.length > 1) {
                  e.preventDefault();
                  inline.onToggle(anchor.current!);
                  return;
                }
                if (inline.expanded) inline.onToggle(anchor.current!);
                onNavigate?.(e, href);
                return;
              }
              if (press.current.type !== "mouse" && !press.current.wasOpen && items.length > 1) {
                e.preventDefault();
                pinned.current = true;
                show(true);
              } else {
                hide();
                onNavigate?.(e, href);
              }
            }}
            className={triggerClassName}
          >
            {trigger}
          </Link>
          <button ref={button} type="button" onClick={onButton} aria-expanded={expanded} aria-controls={controls} aria-label={`הקטגוריות ב${label}`} className={toggleClassName}>
            {chevron}
          </button>
        </>
      )}
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
          <FlyoutList href={href} allLabel={allLabel} allCount={allCount} items={items} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

/** A group's categories: "הכל ב…" first, then a row per category. In the flyout, and inline on a phone. */
export function FlyoutList({
  href,
  allLabel,
  allCount,
  items,
  onNavigate,
}: {
  href: string;
  allLabel: ReactNode;
  allCount: number;
  items: FlyoutItem[];
  onNavigate?: FlyoutNavigate;
}) {
  return (
    <>
      <Link href={href} onClick={(e) => onNavigate?.(e, href)} className="flyout-row flyout-all">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flyout-title text-body font-semibold">{allLabel}</span>
          <span className="text-caption text-muted tabular-nums">{countOf(allCount, PRODUCT)}</span>
        </span>
        <ChevronLeft size={20} strokeWidth={1.75} aria-hidden className="flyout-chevron shrink-0" />
      </Link>
      <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {items.map((c) => (
          <li key={c.slug}>
            <Link href={c.href} onClick={(e) => onNavigate?.(e, c.href)} aria-current={c.current ? "page" : undefined} className={`flyout-row ${c.count === 0 && !c.current ? "opacity-55" : ""}`}>
              <span className="tile-fade flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl p-1.5">
                {c.image && (
                  // Hot-linked from the supplier's CDN, like every catalog photo. Fetched with the page at low
                  // priority (not lazily), so a hover makes no request and the flyout opens with its photos.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img {...shopifyImage(c.image, 96)} alt="" fetchPriority="low" decoding="async" referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flyout-title text-body leading-snug font-medium">{c.name}</span>
                <span className="text-caption text-muted tabular-nums">{countOf(c.count, PRODUCT)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * A phone's categories in the page, under their trigger's row: they push the page down and scroll
 * with it. Escape closes them and puts focus back on the trigger; following a link closes them too.
 */
export function InlineFlyout({ id, label, onClose, children }: { id: string; label: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      id={id}
      role="group"
      aria-label={label}
      className="flyout-panel flyout-inline"
      onClick={(e) => {
        if ((e.target as Element).closest("a")) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onClose();
        document.querySelector<HTMLElement>(`[aria-controls="${id}"]`)?.focus();
      }}
    >
      {children}
    </div>
  );
}
