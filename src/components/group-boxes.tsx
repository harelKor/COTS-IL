"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { groupCategories } from "@/domain/category-groups";
import { shopifyImage } from "@/lib/images";
import { PhotoFan } from "./category-showcase";

export type GroupTile = { slug: string; name: string; count: number; images: string[]; href: string };

/** Columns of the group grid at each width; must match the grid classes below. */
const COLUMNS = [
  { query: "(min-width: 1024px)", cols: 5 },
  { query: "(min-width: 640px)", cols: 3 },
];

function columns() {
  return COLUMNS.find((c) => window.matchMedia(c.query).matches)?.cols ?? 2;
}
function onResize(notify: () => void) {
  window.addEventListener("resize", notify);
  return () => window.removeEventListener("resize", notify);
}

/** The opened group's categories: grows from nothing (250 ms) and scrolls just into view. */
function Panel({ id, labelledBy, items }: { id: string; labelledBy: string; items: GroupTile[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOpen(true));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = setTimeout(() => ref.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" }), reduced ? 0 : 260);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div
      ref={ref}
      id={id}
      role="region"
      aria-labelledby={labelledBy}
      className={`col-span-full grid transition-[grid-template-rows,opacity] duration-[250ms] ease-out motion-reduce:transition-none ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
    >
      <div className="overflow-hidden">
        <ul className="grid grid-cols-2 gap-2 rounded-[22px] bg-subtle/70 p-2 sm:grid-cols-3 sm:gap-3 sm:p-3 lg:grid-cols-5">
          {items.map((c) => (
            <li key={c.slug}>
              <Link
                href={c.href}
                className="group flex h-full min-h-14 items-center gap-3 rounded-2xl bg-surface p-2 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift"
              >
                <span className="tile-fade flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl p-1">
                  {c.images[0] && (
                    // Hot-linked from the supplier's CDN, like every catalog photo.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img {...shopifyImage(c.images[0], 48)} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
                  )}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-callout leading-snug font-semibold group-hover:text-brand">{c.name}</span>
                  <span className="text-caption text-muted tabular-nums">{c.count.toLocaleString("he-IL")} מוצרים</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The five groups as big photo boxes. Tapping one opens its categories in a full-width panel
 * under that row of the grid; one group at a time, tapping it again closes it.
 */
export function GroupBoxes({ categories }: { categories: GroupTile[] }) {
  const groups = groupCategories(categories);
  const [openId, setOpenId] = useState<string | null>(null);
  const cols = useSyncExternalStore(onResize, columns, () => 2);
  const base = useId();
  const openIndex = groups.findIndex((g) => g.id === openId);
  // The panel goes after the last box of the opened box's row (or the last box).
  const panelAfter = openIndex < 0 ? -1 : Math.min(groups.length - 1, Math.floor(openIndex / cols) * cols + cols - 1);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      {groups.map((g, i) => {
        const open = g.id === openId;
        const images = g.items.flatMap((c) => c.images.slice(0, 1)).slice(0, 3);
        return (
          <Fragment key={g.id}>
            <button
              type="button"
              id={`${base}-${g.id}`}
              aria-expanded={open}
              aria-controls={open ? `${base}-panel` : undefined}
              onClick={() => setOpenId(open ? null : g.id)}
              className={`group flex h-full flex-col gap-3 rounded-[22px] border p-4 text-start shadow-card transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-lift sm:p-5 ${
                open ? "border-brand bg-brand-soft/40" : "border-line bg-tile-card hover:border-brand/50"
              }`}
            >
              <span className="relative flex h-24 items-center justify-center">
                <PhotoFan slug={g.items[0]?.slug} images={images} />
              </span>
              <span className="flex items-end justify-between gap-2">
                <span className="flex min-w-0 flex-col items-start gap-1.5">
                  <span className="text-body leading-snug font-semibold group-hover:text-brand">{g.name}</span>
                  <span className="rounded-full bg-brand-soft/70 px-2.5 py-0.5 text-caption font-semibold text-brand tabular-nums">
                    {g.count.toLocaleString("he-IL")} מוצרים
                  </span>
                </span>
                <ChevronDown
                  size={20}
                  strokeWidth={1.75}
                  aria-hidden
                  className={`shrink-0 text-brand transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
                />
              </span>
            </button>
            {i === panelAfter && openIndex >= 0 && (
              <Panel key={openId} id={`${base}-panel`} labelledBy={`${base}-${openId}`} items={groups[openIndex].items} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
