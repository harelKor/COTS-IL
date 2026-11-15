import { Flame } from "lucide-react";

/**
 * The flame badge of the hot rows ("הכי מבוקשים", a product's suggestions): a flickering flame with
 * a yellow core and two rising embers (globals.css, "on fire"). It pauses while an ancestor has
 * `data-offscreen` and stays still under reduced motion.
 */
export function FireBadge() {
  return (
    <span aria-hidden className="fire-badge relative flex size-9 shrink-0 items-center justify-center rounded-xl">
      <Flame size={20} strokeWidth={2} className="fire-outer" />
      <Flame size={10} strokeWidth={0} className="fire-core" />
      <span className="fire-ember" />
      <span className="fire-ember fire-ember-2" />
    </span>
  );
}
