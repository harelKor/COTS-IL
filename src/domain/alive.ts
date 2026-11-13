/**
 * The "alive" motion's timing per card: a delay and a rhythm taken from the card's id, so cards
 * hop at their own, scattered moments (never together) and the same card keeps its rhythm
 * across renders (no hydration mismatch, nothing random at render time).
 */

/** A small stable hash of a string (FNV-1a), 0..2^32-1. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** CSS custom properties for `.alive`: `--hop` (one cycle, 7–13 s) and `--hd` (its delay, 0–9 s). */
export function aliveStyle(id: string): Record<"--hop" | "--hd", string> {
  const h = hash(id);
  const hop = 7 + (h % 61) / 10;
  const delay = ((h >>> 8) % 91) / 10;
  return { "--hop": `${hop.toFixed(1)}s`, "--hd": `${delay.toFixed(1)}s` };
}
