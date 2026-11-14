import { describe, expect, it } from "vitest";
import { findLinked, variantParam } from "./link";

// The Kraken X60: WCP makes it, and CTRE sells it under WCP's SKU.
const wcp = { id: "556dd598-131e-4d27-88c5-e09398a078f0", sku: "WCP-0940", supplierCode: "wcp" };
const ctre = { id: "d5b568e4-155c-4424-890f-0a196c36611c", sku: "WCP-0940", supplierCode: "ctre" };
const cover = { id: "c0", sku: "24-758367", supplierCode: "ctre" };
const family = [wcp, ctre, cover];

describe("findLinked", () => {
  it("opens on the variant a link names by id, whatever its SKU", () => {
    expect(findLinked(family, ctre.id)).toBe(ctre);
    expect(findLinked(family, ctre.id.toUpperCase(), "wcp")).toBe(ctre);
  });

  it("settles a SKU two vendors share by the vendor in the link", () => {
    expect(findLinked(family, "wcp-0940", "ctre")).toBe(ctre);
    expect(findLinked(family, "WCP-0940", "wcp")).toBe(wcp);
  });

  it("takes the first (best) offer for a shared SKU without a vendor", () => {
    expect(findLinked(family, "WCP-0940")).toBe(wcp);
    expect(findLinked([ctre, wcp], "WCP-0940", null)).toBe(ctre);
  });

  it("finds a unique SKU in any case, and nothing for an unknown one", () => {
    expect(findLinked(family, " 24-758367 ")).toBe(cover);
    expect(findLinked(family, "WCP-9999")).toBeUndefined();
    expect(findLinked(family, null)).toBeUndefined();
  });
});

describe("variantParam", () => {
  it("writes the variant id when another offer has the same SKU", () => {
    expect(variantParam(ctre, family)).toBe(ctre.id);
    expect(variantParam(wcp, family)).toBe(wcp.id);
  });

  it("writes the SKU when it is the family's only one, and the id when there's none", () => {
    expect(variantParam(cover, family)).toBe("24-758367");
    expect(variantParam({ id: "x", sku: null, supplierCode: "rev" }, family)).toBe("x");
  });

  it("round-trips: what it writes, findLinked opens", () => {
    for (const v of family) expect(findLinked(family, variantParam(v, family))).toBe(v);
  });
});
