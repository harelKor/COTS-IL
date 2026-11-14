import { describe, expect, it } from "vitest";
import { groupFamilies, type GroupProduct } from "./group";

// The audit's cases (docs/AUDIT-UX-2026-11-14.md, L-03, L-04), from the catalog as synced on Nov 13, 2026.

function product(
  id: string,
  supplierCode: string,
  title: string,
  categorySlug: string,
  variants: GroupProduct["variants"],
  descriptionHtml: string | null = null,
): GroupProduct {
  return { id, supplierCode, title, categorySlug, descriptionHtml, variants };
}

function one(id: string, supplierCode: string, title: string, sku: string | null, priceUsd: number | null, categorySlug = "electronics") {
  return product(id, supplierCode, title, categorySlug, [{ id: `${id}-v`, sku, options: [], priceUsd }]);
}

const familyOf = (families: ReturnType<typeof groupFamilies>["families"], productId: string) => families.find((f) => f.productIds.includes(productId))!;

describe("merges across vendors: shared SKUs (C-15, L-03)", () => {
  it("lists CTRE on the Kraken X60 because CTRE sells it under WCP's SKU", () => {
    const { families } = groupFamilies([
      one("wcp-kraken", "wcp", "Kraken X60 Powered by TalonFX", "WCP-0940", 199.99, "motors"),
      one("ctre-kraken", "ctre", "Kraken X60 High Performance Brushless Motor Powered by Talon FX®", "WCP-0940", 199.99, "motors"),
    ]);
    expect(families).toHaveLength(1);
    expect(families[0].suppliers.sort()).toEqual(["ctre", "wcp"]);
    expect(families[0].variantIds).toHaveLength(2);
  });

  it("puts CTRE on the HTD belts only through the WCP SKUs it sells, never by the title", () => {
    const ctre = product("ctre-belts", "ctre", "WCP Synchronous 15mm Timing Belts", "belts-chain", [
      { id: "c40", sku: "WCP-0526", options: [{ name: "Belt Size", value: "40t" }], priceUsd: 7.99 },
      { id: "c45", sku: "WCP-0163", options: [{ name: "Belt Size", value: "45t" }], priceUsd: 7.99 },
    ]);
    const { families } = groupFamilies([
      one("w40", "wcp", "40t x 15mm Wide Timing Belt (HTD 5mm)", "WCP-0526", 7.99, "belts-chain"),
      one("w45", "wcp", "45t x 15mm Wide Timing Belt (HTD 5mm)", "WCP-0163", 7.99, "belts-chain"),
      ctre,
      // The same title at another vendor, under its own part number: not the same belt.
      one("t40", "ttb", "40t x 15mm Wide Timing Belt (HTD 5mm)", "TTB-0040", 7.5, "belts-chain"),
      one("t50", "ttb", "50t x 15mm Wide Timing Belt (HTD 5mm)", "TTB-0050", 8.5, "belts-chain"),
    ]);
    const wcp = familyOf(families, "w40");
    expect(wcp.title).toBe("Timing Belt (HTD 5mm)");
    expect(wcp.key).toBe("t:belts-chain:timing belt htd 5mm");
    expect(wcp.suppliers.sort()).toEqual(["ctre", "wcp"]);
    expect(wcp.variantIds.sort()).toEqual(["c40", "c45", "w40-v", "w45-v"]);
    const ttb = familyOf(families, "t40");
    expect(ttb).not.toBe(wcp);
    expect(ttb.suppliers).toEqual(["ttb"]);
    expect(ttb.productIds.sort()).toEqual(["t40", "t50"]);
  });

  it("keeps another vendor's 20 DP gears with the same title out of WCP's family", () => {
    const { families } = groupFamilies([
      one("w20", "wcp", '20t Aluminum Spur Gear (20 DP, 1/2" Hex Bore)', "WCP-0701", 10.99, "gears"),
      one("w22", "wcp", '22t Aluminum Spur Gear (20 DP, 1/2" Hex Bore)', "WCP-0702", 10.99, "gears"),
      one("a20", "andymark", '20t Aluminum Spur Gear (20 DP, 1/2" Hex Bore)', "am-0920", 10.99, "gears"),
    ]);
    expect(familyOf(families, "w20").suppliers).toEqual(["wcp"]);
    expect(familyOf(families, "w20").productIds.sort()).toEqual(["w20", "w22"]);
    expect(familyOf(families, "a20").suppliers).toEqual(["andymark"]);
  });
});

describe("merges across vendors: no SKU in common (L-04)", () => {
  it('joins CTRE\'s Kraken Wire Bundle and WCP\'s Kraken Wire Bundle 18" at the same price', () => {
    const { families, issues } = groupFamilies([
      one("ctre-wire", "ctre", "Kraken Wire Bundle", "23-758766", 10.49),
      one("wcp-wire", "wcp", 'Kraken Wire Bundle 18" (10 AWG Power, 22 AWG CAN)', "WCP-1866", 10.49),
    ]);
    expect(families).toHaveLength(1);
    expect(families[0].suppliers.sort()).toEqual(["ctre", "wcp"]);
    expect(families[0].variantIds).toHaveLength(2);
    expect(issues).toEqual([]);
  });

  it("doesn't join a longer name at another price", () => {
    const { families } = groupFamilies([
      one("ctre-x60", "ctre", "Kraken X60 Motor", "24-1", 199.99, "motors"),
      one("wcp-sticker", "wcp", "Kraken X60 Motor Sticker", "WCP-1545", 2.99, "motors"),
    ]);
    expect(families).toHaveLength(2);
  });

  it("joins REV's NEO 550 and AndyMark's REV NEO 550 by the part number AndyMark names", () => {
    const rev = one("rev-neo550", "rev", "NEO 550 Brushless Motor", "REV-21-1651", 30, "motors");
    const am = product(
      "am-neo550",
      "andymark",
      "REV NEO 550 Brushless Motor",
      "motors",
      [
        { id: "am-none", sku: "am-4259", options: [{ name: "Pinion", value: "No Pinion" }], priceUsd: 22 },
        { id: "am-12", sku: "am-4259_12T", options: [{ name: "Pinion", value: "12 Tooth 32 DP" }], priceUsd: 35 },
        { id: "am-16", sku: "am-4259_16T", options: [{ name: "Pinion", value: "16 Tooth For 57 Sport" }], priceUsd: 35 },
      ],
      "<p>The REV NEO 550 Brushless Motor (REV-21-1651) is the smaller NEO. Pairs with the SPARK MAX (REV-11-2158).</p>",
    );
    const { families } = groupFamilies([rev, am, one("rev-max", "rev", "SPARK MAX Motor Controller", "REV-11-2158", 90, "motors")]);
    const neo = familyOf(families, "rev-neo550");
    expect(neo.productIds.sort()).toEqual(["am-neo550", "rev-neo550"]);
    expect(neo.title).toBe("NEO 550 Brushless Motor");
    expect(neo.suppliers.sort()).toEqual(["andymark", "rev"]);
    // REV's motor is AndyMark's "No Pinion" choice: one chip with two offers.
    expect(neo.variantOptions["rev-neo550-v"]).toEqual({ pinion: "No Pinion" });
    expect(neo.variantOptions["am-none"]).toEqual({ pinion: "No Pinion" });
    // The controller it also names has another name, so it stays apart.
    expect(familyOf(families, "rev-max").productIds).toEqual(["rev-max"]);
  });

  it("joins the same name when one title names the other vendor, whatever the price", () => {
    const { families } = groupFamilies([
      one("am-sensor", "andymark", "REV Analog Pressure Sensor", "am-3219", 29),
      one("rev-sensor", "rev", "Analog Pressure Sensor", "REV-11-1107", 39.42),
    ]);
    expect(families).toHaveLength(1);
  });

  it('reads "&" and "and" as the same name', () => {
    const { families } = groupFamilies([
      one("ctre-cover", "ctre", "Kraken X60 Screw and Terminal Cover Kit", "24-758367", 6.29, "motors"),
      one("wcp-cover", "wcp", "Kraken X60 Screw & Terminal Cover Kit", "WCP-1865", 6.29, "motors"),
    ]);
    expect(families).toHaveLength(1);
  });

  it("keeps the same name at different prices apart and sends it to the grouping report", () => {
    const { families, issues } = groupFamilies([
      one("rev-tb", "rev", "#25 Chain Turnbuckle", "REV-21-2617", 11, "belts-chain"),
      one("wcp-tb", "wcp", "#25 Chain TurnBuckle", "WCP-0247", 14.99, "belts-chain"),
      one("rev-poe", "rev", "POE Injector Cable", "REV-11-1210", 12.5),
      one("wcp-poe", "wcp", "PoE Injector Cable", "WCP-2142", 9.99),
    ]);
    expect(families).toHaveLength(4);
    expect(
      issues
        .filter((i) => i.reason === "name-only")
        .map((i) => i.productId)
        .sort(),
    ).toEqual(["rev-poe", "rev-tb", "wcp-poe", "wcp-tb"]);
    expect(issues.find((i) => i.productId === "rev-tb" && i.reason === "name-only")!.detail).toBe("#25 Chain Turnbuckle ↔ wcp: #25 Chain TurnBuckle");
  });
});

describe("one vendor's listings folded into one family (L-04)", () => {
  const swerveListing = (id: string, pinion: string, ratio: string, wheel: string) =>
    product(
      id,
      "andymark",
      `SDS MK4i Swerve Modules - Motor Pinion Type:${pinion}, Gear Ratio:${ratio}, Wheel Type:${wheel}`,
      "gearboxes",
      (
        [
          ["CXCA", "CANCoder", "Yes", 433.5],
          ["CXCU", "CANCoder", "No", 352.75],
          ["CXXA", "None", "Yes", 340.85],
        ] as const
      ).map(([code, encoder, assembled, price]) => ({
        id: `${id}-${code}`,
        sku: `am-4755i_${id}${code}`,
        priceUsd: price,
        options: [
          { name: "Motor Pinion Type", value: pinion },
          { name: "Gear Ratio", value: ratio },
          { name: "Wheel Type", value: wheel },
          { name: "Steering Encoder", value: encoder },
          { name: "Assembled", value: assembled },
        ],
      })),
    );

  it("folds AndyMark's one-product-per-combination SDS modules into one family", () => {
    const { families } = groupFamilies([
      swerveListing("F3C", "Falcon Spline", "L3 6.12:1", "Colson Wheel"),
      swerveListing("F2C", "Falcon Spline", "L2 6.75:1", "Colson Wheel"),
      swerveListing("K3B", "15T 8mm Spline", "L3 6.12:1", "Billet Wheel"),
      // MK4, not MK4i: its own family. These variants name only one option; the rest come from the title.
      product("mk4", "andymark", "SDS MK4 Swerve Modules - Motor Pinion Type:Falcon Spline, Gear Ratio:L1 8.14:1, Wheel Type:Colson Wheel", "gearboxes", [
        { id: "mk4-v", sku: "am-4755a_F1CXCA", options: [{ name: "Motor Pinion Type", value: "Falcon Spline" }], priceUsd: 433.5 },
      ]),
      product("mk4b", "andymark", "SDS MK4 Swerve Modules - Motor Pinion Type:NEO 8mm Key, Gear Ratio:L2 6.75:1, Wheel Type:Colson Wheel", "gearboxes", [
        { id: "mk4b-v", sku: "am-4755a_N2CXCA", options: [{ name: "Motor Pinion Type", value: "NEO 8mm Key" }], priceUsd: 433.5 },
      ]),
    ]);
    expect(families).toHaveLength(2);
    const mk4i = familyOf(families, "F3C");
    expect(mk4i.title).toBe("SDS MK4i Swerve Modules");
    expect(mk4i.key).toBe("l:andymark:sds mk4i swerve modules");
    expect(mk4i.suppliers).toEqual(["andymark"]);
    expect(mk4i.variantIds).toHaveLength(9);
    expect(mk4i.optionKeys).toEqual(["assembled", "gear-ratio", "motor-pinion-type", "steering-encoder", "wheel-type"]);
    expect(mk4i.variantOptions["F3C-CXCU"]).toEqual({
      "motor-pinion-type": "Falcon Spline",
      "gear-ratio": "L3 6.12:1",
      "wheel-type": "Colson Wheel",
      "steering-encoder": "CANCoder",
      assembled: "No",
    });
    const mk4 = familyOf(families, "mk4");
    expect(mk4.title).toBe("SDS MK4 Swerve Modules");
    expect(mk4.variantOptions["mk4b-v"]).toEqual({ "motor-pinion-type": "NEO 8mm Key", "gear-ratio": "L2 6.75:1" });
  });

  it('reads AndyMark\'s "Motor Pinon Type" as Motor Pinion Type', () => {
    const listing = (id: string, value: string) =>
      product(id, "andymark", `SDS MK4n Swerve Modules - Motor Pinon Type:${value}`, "gearboxes", [{ id: `${id}-v`, sku: id, options: [{ name: "Motor Pinon Type", value }] }]);
    const [f] = groupFamilies([listing("n1", "NEO Vortex 8mm Key"), listing("n2", "Falcon Spline")]).families;
    expect(f.optionKeys).toEqual(["motor-pinion-type"]);
  });

  it("leaves a single listing with options in its title as it is", () => {
    const [f] = groupFamilies([product("x", "andymark", "Standard 20 DP Gears - Bore:1/2 Hex", "gears", [{ id: "x-v", sku: "am-1", options: [] }])]).families;
    expect(f.title).toBe("Standard 20 DP Gears - Bore:1/2 Hex");
  });

  it("folds WCP's wire, one gauge and colour per listing, into one family", () => {
    const { families } = groupFamilies([
      one("b18", "wcp", "18AWG Black Thin Insulation Wire (25-feet)", "WCP-2516", 16.99),
      one("r18", "wcp", "18AWG Red Thin Insulation Wire (25-feet)", "WCP-2512", 16.99),
      one("b12", "wcp", "12AWG Black Thin Insulation Wire (25-feet)", "WCP-2514", 21.99),
    ]);
    expect(families).toHaveLength(1);
    expect(families[0].title).toBe("Thin Insulation Wire (25-feet)");
    expect(families[0].optionKeys).toEqual(["awg", "color"]);
    expect(families[0].variantOptions["b18-v"]).toEqual({ awg: "18AWG", color: "Black" });
  });
});
