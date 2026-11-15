/**
 * Places a fixed popover (it lives in the browser's top layer, so no scrolling row or card clips it)
 * right under its anchor. An anchor on the right half of the window lines the panel up with its
 * right edge (the site reads right to left), one on the left half with its left edge, so the cards
 * at either end open toward the middle. It always stays 16px inside the window, and is never taller
 * than the room left under the anchor.
 */
export function placeUnder(anchor: HTMLElement, panel: HTMLElement, width: number) {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const w = Math.min(width, vw - 32);
  const r = anchor.getBoundingClientRect();
  const left = Math.max(16, Math.min(r.left + r.width / 2 >= vw / 2 ? r.right - w : r.left, vw - 16 - w));
  panel.style.width = `${w}px`;
  panel.style.top = `${Math.round(r.bottom)}px`;
  // In right-to-left the inline start is the window's right edge.
  panel.style.insetInlineStart = `${Math.round(vw - left - w)}px`;
  panel.style.maxHeight = `${Math.max(200, Math.round(vh - r.bottom - 16))}px`;
}

/** The sticky site header's height and a margin: a panel opened upward stops under it. */
const TOP_ROOM = 68;

/**
 * Once the popover is open (so it can be measured, before the browser paints): if its whole height
 * fits under the anchor it stays there unclipped. If not and `scroll` is allowed (a click, not a
 * hover), the page scrolls just enough for it to fit under the anchor, never taking the anchor
 * under the header. Otherwise, with more room above, it opens upward; failing that it stays under
 * and scrolls inside. So a card low in the window never gets a tiny scroll box. Returns whether the
 * page scrolled.
 */
export function fitToRoom(anchor: HTMLElement, panel: HTMLElement, scroll = false): boolean {
  const vh = window.innerHeight;
  let r = anchor.getBoundingClientRect();
  panel.style.maxHeight = "none";
  const h = panel.getBoundingClientRect().height;
  let below = vh - r.bottom - 16;
  let scrolled = false;
  if (scroll && h > below) {
    const by = Math.round(Math.min(h - below, r.top - TOP_ROOM));
    if (by > 0) {
      window.scrollBy({ top: by, behavior: "instant" });
      r = anchor.getBoundingClientRect();
      below = vh - r.bottom - 16;
      scrolled = true;
    }
  }
  const above = r.top - TOP_ROOM;
  if (h <= below || scrolled) {
    panel.style.top = `${Math.round(r.bottom)}px`;
    if (h > below) panel.style.maxHeight = `${Math.round(Math.max(200, below))}px`;
  } else if (above > below) {
    const shown = Math.min(h, above);
    panel.style.top = `${Math.round(r.top - 6 - shown)}px`;
    panel.style.maxHeight = `${Math.round(shown)}px`;
  } else {
    panel.style.top = `${Math.round(r.bottom)}px`;
    panel.style.maxHeight = `${Math.round(Math.max(200, below))}px`;
  }
  return scrolled;
}
