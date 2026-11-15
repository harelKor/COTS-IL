import { describe, expect, it } from "vitest";
import stealthRows from "./__fixtures__/stealth.json";
import beltRows from "./__fixtures__/timing-belt.json";
import { clashesWith, pick, settle, withChoice } from "./pick";
import { chipPreview, groupPreviews, priceRange, remaining, supplierShare } from "./preview";

type Row = { id: string; options: Record<string, string>; priceIls: number | null; supplierCode: string; available: boolean | null };

const stealth = stealthRows as Row[];
const belt = beltRows as Row[];
const stealthKeys = ["bore", "diameter", "durometer"];
const beltKeys = ["teeth", "width"];

/** What the headline shows: the range of what's left, or the settled offer's price. */
function headline(variants: Row[], keys: string[], choices: Record<string, string>, offer = (c: Row[]) => c[0]) {
  const s = settle(variants, keys, choices);
  if (s.chosen) return { min: offer(s.candidates).priceIls, max: offer(s.candidates).priceIls };
  return priceRange(s.candidates);
}

const values = (variants: Row[], key: string) => [...new Set(variants.map((v) => v.options[key]))];

describe("the fixtures", () => {
  it("are shaped like the real pages", () => {
    expect(stealth).toHaveLength(70); // 4 × 4 × 5 = 80, with gaps
    expect(belt).toHaveLength(156);
    expect(new Set(belt.map((v) => v.supplierCode))).toEqual(new Set(["wcp", "ctre"]));
  });
});

describe("remaining and priceRange", () => {
  it("is everything before a choice", () => {
    expect(remaining(stealth, stealthKeys, {})).toHaveLength(70);
    const all = stealth.map((v) => v.priceIls!);
    expect(priceRange(stealth)).toEqual({ min: Math.min(...all), max: Math.max(...all) });
  });

  it("narrows with each choice, and equals min and max of what's left", () => {
    const left = remaining(stealth, stealthKeys, { diameter: "4 inch" });
    expect(left.every((v) => v.options.diameter === "4 inch")).toBe(true);
    const prices = left.map((v) => v.priceIls!);
    expect(priceRange(left)).toEqual({ min: Math.min(...prices), max: Math.max(...prices) });
  });

  it("skips unpriced parts, and is null when none has a price", () => {
    expect(priceRange([{ priceIls: null }, { priceIls: 40 }, { priceIls: 30 }])).toEqual({ min: 30, max: 40 });
    expect(priceRange([{ priceIls: null }])).toBeNull();
  });
});

describe("chipPreview", () => {
  it("equals the headline after the tap that settles the part (Stealth, every chip of every group)", () => {
    const starts: Record<string, string>[] = [{ bore: "1/2 in Hex", diameter: "2 inch" }, { diameter: "3 inch", durometer: "40A" }, { bore: "5 mm Hex", durometer: "35A" }];
    for (const choices of starts) {
      for (const key of stealthKeys) {
        for (const value of values(stealth, key)) {
          const preview = chipPreview(stealth, stealthKeys, choices, key, value);
          const after = withChoice(stealth, choices, key, value);
          const h = headline(stealth, stealthKeys, after);
          if (!preview) continue;
          if (settle(stealth, stealthKeys, after).chosen) expect(preview).toEqual({ price: h!.min, exact: true });
          else expect(preview.price).toBe(h!.min);
        }
      }
    }
  });

  it("says 'from' while the tap leaves several prices", () => {
    const p = chipPreview(belt, beltKeys, {}, "width", "15mm");
    const prices = belt.filter((v) => v.options.width === "15mm").map((v) => v.priceIls!);
    expect(p).toEqual({ price: Math.min(...prices), exact: false });
  });

  it("shows the chosen chip's own price, not a toggle", () => {
    const choices = { teeth: "100t", width: "9mm" };
    const p = chipPreview(belt, beltKeys, choices, "width", "9mm");
    expect(p?.exact).toBe(true);
    expect(p?.price).toBe(headline(belt, beltKeys, choices)!.min);
  });

  it("uses the offer the page would pick when two vendors sell the part", () => {
    // A belt both vendors sell: the preview follows the page's choice of offer.
    const same = (a: Row, b: Row) => a.options.teeth === b.options.teeth && a.options.width === b.options.width;
    const shared = belt.find((v) => v.supplierCode === "ctre" && belt.some((w) => w.supplierCode === "wcp" && same(v, w)))!;
    const choices = { width: shared.options.width };
    const ctre = (c: Row[]) => c.find((v) => v.supplierCode === "ctre");
    const p = chipPreview(belt, beltKeys, choices, "teeth", shared.options.teeth, ctre);
    expect(p).toEqual({ price: shared.priceIls, exact: true });
  });

  it("previews a clashing value on its own, as a tap would leave it", () => {
    expect(stealth.some((v) => v.options.bore === "Nub Bore" && v.options.diameter === "1 inch")).toBe(false);
    expect(pick(stealth, stealthKeys, { diameter: "1 inch" }).chips.bore.find((c) => c.value === "Nub Bore")?.enabled).toBe(false);
    // 1 inch with nub bore doesn't exist: a tap on nub bore clears the diameter.
    expect(withChoice(stealth, { diameter: "1 inch" }, "bore", "Nub Bore")).toEqual({ bore: "Nub Bore" });
    const p = chipPreview(stealth, stealthKeys, { diameter: "1 inch" }, "bore", "Nub Bore");
    expect(p?.price).toBe(priceRange(stealth.filter((v) => v.options.bore === "Nub Bore"))!.min);
  });
});

describe("groupPreviews", () => {
  it("hides a group's prices when every chip would read the same", () => {
    // With a diameter picked, Stealth costs the same whatever the bore.
    const diameter = "2 inch";
    const prices = new Set(stealth.filter((v) => v.options.diameter === diameter).map((v) => v.priceIls));
    expect(prices.size).toBe(1);
    expect(groupPreviews(stealth, stealthKeys, { diameter }, "bore", values(stealth, "bore")).every((p) => p === null)).toBe(true);
  });

  it("keeps prices on a group when they differ, before and after other choices", () => {
    const teeth = values(belt, "teeth");
    expect(groupPreviews(belt, beltKeys, {}, "teeth", teeth).filter(Boolean).length).toBeGreaterThan(40);
    expect(groupPreviews(belt, beltKeys, { width: "9mm" }, "teeth", teeth).some((p) => p?.exact)).toBe(true);
  });
});

describe("supplierShare", () => {
  it("gives each vendor its own 'from' price for the choice so far", () => {
    const left = remaining(belt, beltKeys, { width: "15mm" });
    const wcp = supplierShare(left, "wcp");
    const ctre = supplierShare(left, "ctre");
    expect(wcp?.range?.min).toBe(priceRange(left.filter((v) => v.supplierCode === "wcp"))!.min);
    expect(ctre?.range).not.toBeNull();
    expect(supplierShare(left, "andymark")).toBeNull();
  });
});

describe("clashesWith", () => {
  it("names the choice a value doesn't go with", () => {
    expect(clashesWith(stealth, { diameter: "1 inch", durometer: "35A" }, "bore", "Nub Bore")).toEqual(["diameter"]);
  });

  it("names every other choice when only the combination clashes", () => {
    const rows = [
      { id: "a", options: { x: "1", y: "1", z: "1" } },
      { id: "b", options: { x: "1", y: "2", z: "2" } },
      { id: "c", options: { x: "2", y: "1", z: "2" } },
    ];
    expect(pick(rows, ["x", "y", "z"], { x: "1", y: "1" }).chips.z.find((c) => c.value === "2")?.enabled).toBe(false);
    expect(clashesWith(rows, { x: "1", y: "1" }, "z", "2")).toEqual(["x", "y"]);
  });
});
