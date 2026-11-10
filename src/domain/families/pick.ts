import { compareOptionValues } from "./sort";

/** Option chips on a family card or page: what can still be picked, and the variant once it's settled. */

export type Pickable = { id: string; options: Record<string, string> };

/** A variant without a key (a standard-width gear among 1/2" wide ones) has the value NONE for it. */
export const NONE = "";

export type ChipState = { value: string; selected: boolean; enabled: boolean };

export type Picked<V extends Pickable> = {
  /** The choices, including any filled in because only one value was left. */
  selected: Record<string, string>;
  /** Per key, every value of the family, and whether it still fits the other choices. */
  chips: Record<string, ChipState[]>;
  /** Variants that fit every choice made so far, in the order given (cheapest in stock first). */
  candidates: V[];
  /** Set once the choices settle on one part: the first candidate when all fit the same options. */
  chosen: V | null;
};

const valueOf = (v: Pickable, k: string) => v.options[k] ?? NONE;

const fits = (v: Pickable, choices: Record<string, string>) => Object.entries(choices).every(([k, value]) => valueOf(v, k) === value);

const signature = (v: Pickable, keys: string[]) => keys.map((k) => valueOf(v, k)).join("\u0000");

export function pick<V extends Pickable>(variants: V[], keys: string[], choices: Record<string, string>): Picked<V> {
  // Ignore choices that no longer match anything, e.g. a filter value this family doesn't have.
  const selected: Record<string, string> = {};
  for (const k of keys) {
    const value = choices[k];
    if (value !== undefined && variants.some((v) => fits(v, { ...selected, [k]: value }))) selected[k] = value;
  }

  // A key with one value left among the candidates is decided. "None" counts as a value,
  // so a family where only some gears are 1/2" wide doesn't decide on "1/2" wide".
  for (let changed = true; changed; ) {
    changed = false;
    const candidates = variants.filter((v) => fits(v, selected));
    for (const k of keys) {
      if (selected[k] !== undefined) continue;
      const values = new Set(candidates.map((v) => valueOf(v, k)));
      if (values.size === 1) {
        selected[k] = [...values][0];
        changed = true;
      }
    }
  }

  const candidates = variants.filter((v) => fits(v, selected));
  const settled = candidates.length > 0 && new Set(candidates.map((v) => signature(v, keys))).size === 1;

  const chips: Record<string, ChipState[]> = {};
  for (const k of keys) {
    const others = Object.fromEntries(Object.entries(selected).filter(([key]) => key !== k));
    const values = [...new Set(variants.map((v) => valueOf(v, k)))].sort((a, b) =>
      a === NONE ? -1 : b === NONE ? 1 : compareOptionValues(a, b),
    );
    chips[k] = values.map((value) => ({
      value,
      selected: selected[k] === value,
      enabled: variants.some((v) => valueOf(v, k) === value && fits(v, others)),
    }));
  }

  return { selected, chips, candidates, chosen: settled ? candidates[0] : null };
}

/** Choosing a chip: picks it, or clears it when it's already picked. A choice that clashes clears the others. */
export function choose(variants: Pickable[], keys: string[], selected: Record<string, string>, key: string, value: string) {
  if (selected[key] === value) {
    const next = { ...selected };
    delete next[key];
    return next;
  }
  const next = { ...selected, [key]: value };
  if (variants.some((v) => fits(v, next))) return next;
  return { [key]: value };
}

/**
 * The lowest price a chip leads to, given the other choices: what a tap on it would cost
 * at least. Null when nothing it leads to has a price.
 */
export function chipPrice(
  variants: (Pickable & { priceIls: number | null })[],
  selected: Record<string, string>,
  key: string,
  value: string,
): number | null {
  const others = Object.fromEntries(Object.entries(selected).filter(([k]) => k !== key));
  let min: number | null = null;
  for (const v of variants) {
    if (valueOf(v, key) !== value || !fits(v, others) || v.priceIls === null) continue;
    if (min === null || v.priceIls < min) min = v.priceIls;
  }
  return min;
}

/**
 * Option keys that always go together, as groups shown as one picker: when each value
 * of one key comes with exactly one value of another and back (a bearing's ID and OD),
 * two pickers would only switch each other. Keys with one value are left alone.
 */
export function linkedKeys(variants: Pickable[], keys: string[]): string[][] {
  const groups: string[][] = [];
  const bijective = (a: string, b: string) => {
    const ab = new Map<string, string>();
    const ba = new Map<string, string>();
    for (const v of variants) {
      const x = valueOf(v, a);
      const y = valueOf(v, b);
      if ((ab.get(x) ?? y) !== y || (ba.get(y) ?? x) !== x) return false;
      ab.set(x, y);
      ba.set(y, x);
    }
    return ab.size > 1;
  };
  for (const k of keys) {
    const group = groups.find((g) => g.every((other) => bijective(other, k)));
    if (group) group.push(k);
    else groups.push([k]);
  }
  return groups;
}

/** The label of a chip in a linked group: the values of every key in it, "8mm × 22mm". */
export function linkedValue(variants: Pickable[], group: string[], value: string): string {
  const v = variants.find((x) => valueOf(x, group[0]) === value);
  if (!v) return value;
  return group.map((k) => valueOf(v, k)).filter((x) => x !== NONE).join(" × ");
}

/** Keys whose choice changed (or was cleared) by a tap on another key: the picker highlights them. */
export function changedKeys(before: Record<string, string>, after: Record<string, string>, tapped: string): string[] {
  return Object.keys(before).filter((k) => k !== tapped && after[k] !== undefined && after[k] !== before[k]);
}
