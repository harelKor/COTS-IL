import { describe, expect, it } from "vitest";
import { groupFamilies, isReferencePage, slugify, type GroupProduct } from "./group";

let n = 0;
function flat(supplierCode: string, title: string, sku: string | null, categorySlug = "gears"): GroupProduct {
  n++;
  return { id: `p${n}`, supplierCode, title, categorySlug, descriptionHtml: null, variants: [{ id: `v${n}`, sku, options: [] }] };
}

describe("groupFamilies", () => {
  it("groups flat WCP gears by title, with teeth and bore as options", () => {
    const { families } = groupFamilies([
      flat("wcp", '12t Steel Spur Gear (20 DP, 8mm SplineXS Bore)', "WCP-0749"),
      flat("wcp", '36t Steel Spur Gear (20 DP, 1/2" Hex Bore)', "WCP-0543"),
      flat("wcp", '36t Steel Spur Gear (20DP, 3/8" Hex Bore)', "WCP-0544"),
    ]);
    expect(families).toHaveLength(1);
    const [f] = families;
    expect(f.title).toBe("Steel Spur Gear (20 DP)");
    expect(f.slug).toBe("steel-spur-gear-20-dp");
    expect(f.grouping).toBe("title");
    expect(f.optionKeys).toEqual(["teeth", "bore"]);
    expect(Object.values(f.variantOptions)).toContainEqual({ teeth: "12t", bore: "8mm SplineXS" });
  });

  it("keeps different DPs and materials apart", () => {
    const { families } = groupFamilies([
      flat("wcp", '16t Steel Spur Gear (20 DP, 3/8" Hex Bore)', "A"),
      flat("wcp", '18t Steel Spur Gear (20 DP, 3/8" Hex Bore)', "B"),
      flat("wcp", '80t Steel Spur Gear (32 DP, 3/8" Hex Bore)', "C"),
      flat("wcp", '20t Aluminum Spur Gear (20 DP, 1/2" Hex Bore)', "D"),
    ]);
    expect(families.map((f) => f.title).sort()).toEqual([
      '20t Aluminum Spur Gear (20 DP, 1/2" Hex Bore)',
      '80t Steel Spur Gear (32 DP, 3/8" Hex Bore)',
      "Steel Spur Gear (20 DP)",
    ]);
  });

  it("merges a reseller's copy of the same SKU and keeps the original's title", () => {
    const { families } = groupFamilies([
      flat("ctre", 'WCP 44t Pocketed Aluminum Spur Gear (20 DP, 1/2" Hex Bore)', "WCP-0118"),
      flat("wcp", '44t Pocketed Aluminum Spur Gear (20 DP, 1/2" Hex Bore)', "WCP-0118"),
      flat("wcp", '46t Pocketed Aluminum Spur Gear (20 DP, 1/2" Hex Bore)', "WCP-0136"),
    ]);
    expect(families).toHaveLength(1);
    expect(families[0].suppliers.sort()).toEqual(["ctre", "wcp"]);
    expect(families[0].title).toBe("Pocketed Aluminum Spur Gear (20 DP)");
    expect(families[0].optionKeys).toEqual(["teeth"]);
  });

  it("merges a reseller's single listing into a family that has options, by SKU", () => {
    const am: GroupProduct = {
      id: "am",
      supplierCode: "andymark",
      title: "Kraken X60",
      categorySlug: "motors",
      descriptionHtml: null,
      variants: [{ id: "am1", sku: "WCP-0940", options: [] }],
    };
    const { families } = groupFamilies([am, flat("wcp", "Kraken X60 Powered by TalonFX", "WCP-0940", "motors")]);
    expect(families).toHaveLength(1);
    expect(families[0].title).toBe("Kraken X60 Powered by TalonFX");
    expect(families[0].grouping).toBe("single");
  });

  it("doesn't let a reseller's multi-size listing bridge two families", () => {
    const reseller: GroupProduct = {
      id: "ctre-gears",
      supplierCode: "ctre",
      title: "WCP Steel Spur Gears",
      categorySlug: "gears",
      descriptionHtml: null,
      variants: [
        { id: "c10", sku: "WCP-1000", options: [{ name: "Size", value: "10t 10 DP" }] },
        { id: "c20", sku: "WCP-2000", options: [{ name: "Size", value: "20t 20 DP" }] },
        { id: "own", sku: "24-123", options: [{ name: "Size", value: "CTRE only" }] },
      ],
    };
    const { families } = groupFamilies([
      reseller,
      flat("wcp", '10t Steel Spur Gear (10 DP, 1/2" Hex Bore)', "WCP-1000"),
      flat("wcp", '12t Steel Spur Gear (10 DP, 1/2" Hex Bore)', "WCP-1001"),
      flat("wcp", '20t Steel Spur Gear (20 DP, 1/2" Hex Bore)', "WCP-2000"),
      flat("wcp", '22t Steel Spur Gear (20 DP, 1/2" Hex Bore)', "WCP-2001"),
    ]);
    const byTitle = Object.fromEntries(families.map((f) => [f.title, f]));
    expect(Object.keys(byTitle).sort()).toEqual(["Steel Spur Gear (10 DP)", "Steel Spur Gear (20 DP)", "WCP Steel Spur Gears"]);
    expect(byTitle["Steel Spur Gear (10 DP)"].variantIds).toContain("c10");
    expect(byTitle["Steel Spur Gear (20 DP)"].variantIds).toContain("c20");
    // The copy takes the owner's options, not CTRE's "Size".
    expect(byTitle["Steel Spur Gear (10 DP)"].variantOptions.c10).toEqual({ teeth: "10t" });
    expect(byTitle["WCP Steel Spur Gears"].variantIds).toEqual(["own"]);
  });

  it("keeps a supplier's own options as the family's options", () => {
    const product: GroupProduct = {
      id: "am-gears",
      supplierCode: "andymark",
      title: "Standard 20 DP Gears",
      categorySlug: "gears",
      descriptionHtml: null,
      variants: [
        { id: "a", sku: "am-1", options: [{ name: "Bore", value: '1/2" Hex' }, { name: "Teeth", value: "20" }] },
        { id: "b", sku: "am-2", options: [{ name: "Bore", value: '3/8" Hex' }, { name: "Teeth", value: "20" }] },
      ],
    };
    const [f] = groupFamilies([product]).families;
    expect(f.grouping).toBe("supplier");
    expect(f.optionKeys).toEqual(["bore"]);
    expect(f.variantOptions.a).toEqual({ bore: '1/2" Hex' });
  });

  it("splits products with the same sizes out of a group and reports them", () => {
    const { families, issues } = groupFamilies([
      flat("wcp", '14t Aluminum Spur Gear (20 DP, 3/8" Hex Bore)', "A"),
      flat("wcp", '14t Aluminum Spur Gear (20 DP, 3/8" Hex Bore) - Black', "B"),
      flat("wcp", '14t Aluminum Spur Gear (20 DP, 3/8" Hex Bore)', "C"),
      flat("wcp", '16t Aluminum Spur Gear (20 DP, 3/8" Hex Bore)', "D"),
    ]);
    expect(issues.filter((i) => i.reason === "duplicate-options")).toHaveLength(2);
    expect(families).toHaveLength(4);
  });

  it("drops WCP's collection pages and reports them", () => {
    const page: GroupProduct = {
      id: "ref",
      supplierCode: "wcp",
      title: "HTD Timing Belts, 9mm Width",
      categorySlug: "belts-chain",
      descriptionHtml: "<p><strong>This Page is for Reference Only</strong></p>",
      variants: [{ id: "r1", sku: null, options: [] }],
    };
    expect(isReferencePage(page)).toBe(true);
    const { families, issues } = groupFamilies([page]);
    expect(families).toHaveLength(0);
    expect(issues).toEqual([{ productId: "ref", reason: "reference-page", detail: page.title }]);
  });

  it("treats a SKU-less single listing as a collection page only at WCP", () => {
    const collection = { ...flat("wcp", "Metric Bearings", null, "bearings"), descriptionHtml: "<p>Bearings are essential…</p>" };
    const realPart = flat("ttb", "22 Inch Rounded Hex Steel Shaft", null, "shafts");
    expect(isReferencePage(collection)).toBe(true);
    expect(isReferencePage(realPart)).toBe(false);
    expect(isReferencePage(flat("wcp", '36t Steel Spur Gear (20 DP, 1/2" Hex Bore)', "WCP-0543"))).toBe(false);
  });

  it("reports flat parts in size categories whose size it couldn't read", () => {
    const { issues } = groupFamilies([flat("wcp", "#35 Roller Chain (10 feet)", "WCP-0001", "belts-chain")]);
    expect(issues).toEqual([expect.objectContaining({ reason: "no-size" })]);
  });

  it("gives every family a unique slug", () => {
    const { families } = groupFamilies([flat("wcp", "Hub", "A", "other"), flat("andymark", "Hub", "B", "other")]);
    expect(families.map((f) => f.slug).sort()).toEqual(["hub", "hub-2"]);
  });
});

describe("slugify", () => {
  it("keeps inch marks and thread numbers readable", () => {
    expect(slugify('1/2" Hex Bearing (#10-32)')).toBe("1-2in-hex-bearing-no10-32");
  });
});

describe("same name at several suppliers", () => {
  it("joins one flat product per supplier with the same name and no shared SKU", () => {
    const { families } = groupFamilies([
      flat("wcp", "CTR Battery Beak", "WCP-1524", "electronics"),
      flat("ctre", "Battery Beak", "12-666675", "electronics"),
    ]);
    expect(families).toHaveLength(1);
    expect(families[0].suppliers.sort()).toEqual(["ctre", "wcp"]);
  });

  it("keeps two of one supplier's products with that name apart", () => {
    const { families } = groupFamilies([
      flat("wcp", "Battery Beak", "WCP-1", "electronics"),
      flat("wcp", "Battery Beak", "WCP-2", "electronics"),
      flat("ctre", "Battery Beak", "12-1", "electronics"),
    ]);
    expect(families).toHaveLength(3);
  });

  it("strips the maker and trademark signs", async () => {
    const { sameName } = await import("./group");
    expect(sameName("CTRE Pigeon® 2.0")).toBe("pigeon 2 0");
    expect(sameName("Hub")).toBeNull();
  });
});
