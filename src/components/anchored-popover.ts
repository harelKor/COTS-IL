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
