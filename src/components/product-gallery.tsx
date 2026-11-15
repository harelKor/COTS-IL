"use client";

import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { useRef, ViewTransition } from "react";
import { thumbColumns } from "@/domain/gallery";
import { imageLoading, largestImage, shopifyImage } from "@/lib/images";
import { Ltr } from "./ltr";

type Props = {
  title: string;
  /** The photos in order, once each. */
  photos: string[];
  /** The photo on show (one of `photos`, or the family's only one). */
  shown: string | null;
  onShow: (src: string) => void;
  /** Shared with the catalog card's photo, so it morphs into this one. */
  transitionName: string;
  /** The main photo, where "Add" flies to the cart from. */
  mainRef: React.RefObject<HTMLDivElement | null>;
};

/** Pointer travel that counts as a swipe, and as a tap. */
const SWIPE = 40;
const TAP = 8;

/**
 * The product page's photos: the main one (swipe for the next on touch screens, a tap opens it
 * full size), a strip of thumbnails when there's more than one, and the lightbox with previous and
 * next, the arrow keys and swipe. The lightbox and the main photo move together.
 */
export function ProductGallery({ title, photos, shown, onShow, transitionName, mainRef }: Props) {
  const zoom = useRef<HTMLDialogElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const many = photos.length > 1;
  const index = Math.max(0, shown ? photos.indexOf(shown) : 0);

  /** Next in reading order: in Hebrew the photos run right to left. */
  function step(by: 1 | -1) {
    if (!many) return;
    onShow(photos[(index + by + photos.length) % photos.length]);
  }

  function open() {
    if (shown) zoom.current?.showModal();
  }

  /** A swipe to the right brings the next photo (right to left, as the thumbnails run); a tap opens it. */
  function onUp(e: React.PointerEvent, tap: () => void) {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(e.clientY - start.y)) step(dx > 0 ? 1 : -1);
    else if (Math.abs(dx) < TAP) tap();
  }
  const onDown = (e: React.PointerEvent) => (swipe.current = { x: e.clientX, y: e.clientY });

  function onKey(e: React.KeyboardEvent) {
    // Right to left: the left arrow goes forward.
    if (e.key === "ArrowLeft") step(1);
    else if (e.key === "ArrowRight") step(-1);
    else return;
    e.preventDefault();
  }

  const position = many ? `${index + 1} / ${photos.length}` : null;
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <>
      <ViewTransition name={transitionName} share="morph" default="none">
        <div
          ref={mainRef}
          onPointerDown={onDown}
          onPointerUp={(e) => onUp(e, open)}
          onPointerCancel={() => (swipe.current = null)}
          className="relative aspect-square w-full cursor-zoom-in touch-pan-y overflow-hidden rounded-card tile-fade p-8 select-none"
        >
          {shown && (
            // Hot-linked from the supplier's CDN, as agreed in the plan, so next/image is not used.
            // eslint-disable-next-line @next/next/no-img-element
            <img {...shopifyImage(shown, 560)} alt={title} {...imageLoading(true)} referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
          )}
          {shown && (
            <button
              type="button"
              onPointerDown={stop}
              onPointerUp={stop}
              onClick={open}
              aria-label="הגדלת התמונה"
              className="absolute end-2 bottom-2 flex size-11 items-center justify-center rounded-full bg-surface/85 text-foreground shadow-sm backdrop-blur hover:bg-surface"
            >
              <Maximize2 size={18} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>
      </ViewTransition>

      <dialog
        ref={zoom}
        aria-label={title}
        onKeyDown={onKey}
        // The dialog fills the screen; a click outside the photo's panel lands on it and closes.
        onClick={(e) => e.target === e.currentTarget && zoom.current?.close()}
        // theme-independent: a photo viewer over a black scrim in both themes.
        className="photo-lightbox m-0 size-full max-h-none max-w-none place-items-center bg-transparent p-0 open:grid backdrop:bg-black/90 md:p-6"
      >
        <div className="photo-lightbox-panel relative flex size-full flex-col md:size-[min(92vw,calc(100dvh-3rem))] md:rounded-card">
          <div
            onPointerDown={onDown}
            onPointerUp={(e) => onUp(e, () => {})}
            onPointerCancel={() => (swipe.current = null)}
            className="flex min-h-0 flex-1 touch-pan-y items-center justify-center p-4 select-none md:p-10"
          >
            {shown && (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={shown} src={largestImage(shown)} alt={many ? `${title}, תמונה ${index + 1} מתוך ${photos.length}` : title} referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain mix-blend-multiply" />
            )}
          </div>
          <button
            type="button"
            onClick={() => zoom.current?.close()}
            aria-label="סגירה"
            // theme-independent: white on the dark glass over the photo.
            className="absolute end-3 top-3 flex size-11 items-center justify-center rounded-full bg-black/70 text-white shadow-md hover:bg-black/85"
          >
            <X size={20} aria-hidden />
          </button>
          {many && (
            <>
              {/* Previous sits on the right and points right; next on the left, as Hebrew reads. */}
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="התמונה הקודמת"
                // theme-independent: white on the dark glass over the photo.
                className="absolute start-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white shadow-md hover:bg-black/85"
              >
                <ChevronRight size={22} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="התמונה הבאה"
                // theme-independent: white on the dark glass over the photo.
                className="absolute end-3 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-white shadow-md hover:bg-black/85"
              >
                <ChevronLeft size={22} aria-hidden />
              </button>
              {/* theme-independent: white on the dark glass over the photo. */}
              <p aria-live="polite" className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/70 px-3 py-1 text-caption text-white tabular-nums">
                <span className="sr-only">תמונה </span>
                <Ltr>{position}</Ltr>
              </p>
            </>
          )}
        </div>
      </dialog>

      {many && (
        // An even grid from md (thumbColumns: never a lone pair); on phones one row that scrolls sideways.
        <ul
          style={{ "--thumb-cols": thumbColumns(photos.length) } as React.CSSProperties}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-[repeat(var(--thumb-cols),minmax(0,1fr))] md:overflow-visible md:px-0"
        >
          {photos.map((src, i) => (
            <li key={src} className="w-16 shrink-0 md:w-auto">
              <button
                type="button"
                onClick={() => onShow(src)}
                aria-label={`תמונה ${i + 1} מתוך ${photos.length}`}
                aria-current={src === shown ? "true" : undefined}
                className={`aspect-square w-full overflow-hidden rounded-xl bg-tile p-1 ${src === shown ? "ring-2 ring-brand" : "ring-1 ring-line"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img {...shopifyImage(src, 80)} alt="" loading="eager" referrerPolicy="no-referrer" className="size-full object-contain mix-blend-multiply" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
