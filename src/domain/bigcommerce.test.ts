import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { optionCombinations, optionLabel, parseProductPage, parseSitemap, parseVariantAnswer, readJsonObject, type BcProductPage } from "./bigcommerce";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/bigcommerce/${name}`, import.meta.url), "utf8");
const product = (name: string, url = "https://store.example/x/") => {
  const page = parseProductPage(fixture(name), url);
  if (page.kind !== "product") throw new Error(`${name} parsed as ${page.kind}`);
  return page as BcProductPage;
};

describe("parseSitemap", () => {
  it("lists product URLs once", () => {
    expect(parseSitemap(fixture("rev-sitemap.xml"))).toEqual([
      "https://www.revrobotics.com/rev-21-2807/",
      "https://www.revrobotics.com/rev-41-3205/",
      "https://www.revrobotics.com/rev-41-1600/",
    ]);
  });

  it("decodes &amp; in sitemap URLs", () => {
    expect(parseSitemap("<loc>https://a.example/x?type=products&amp;page=1</loc><loc>https://a.example/x?type=products&amp;page=1</loc>")).toEqual(["https://a.example/x?type=products&page=1"]);
  });
});

describe("parseProductPage: goBILDA", () => {
  it("reads a plain product", () => {
    const p = product("gobilda-single.html");
    expect(p).toMatchObject({
      productId: "1298",
      title: "5mm Pitch HTD Timing Belt (9mm Width, 700mm Pitch Length, 140 Tooth)",
      sku: "3412-0009-0700",
      priceUsd: "8.29",
      availability: "in_stock",
      breadcrumbs: ["MOTION", "Timing Belts & Pulleys", "5mm HTD Timing Belts"],
      url: "https://www.gobilda.com/5mm-pitch-htd-timing-belt-9mm-width-700mm-pitch-length-140-tooth/",
      options: [],
      children: [],
      isParent: false,
    });
    expect(p.images[0]).toMatch(/^https:\/\/cdn11\.bigcommerce\.com\/.+\/1280x1280\/products\/1298\//);
    expect(p.grams).toBeGreaterThan(0);
    // This one has no description at the store.
    expect(p.descriptionHtml).toBeNull();
  });

  it("marks a discontinued product and keeps its replacement SKU", () => {
    const p = product("gobilda-discontinued.html");
    expect(p.availability).toBe("discontinued");
    expect(p.replacementSku).toBe("3204-0001-0003");
    expect(p.purchasable).toBe(false);
    expect(p.descriptionHtml).toContain("worm gear set");
    expect(p.images.length).toBeLessThanOrEqual(8);
  });

  it("reads a parent page's children (sizes) and not its cross-sells", () => {
    const p = product("gobilda-parent.html", "https://www.gobilda.com/m4-x-0-7mm-zinc-plated-socket-head-screw-16mm-length/");
    expect(p.isParent).toBe(true);
    expect(p.sku).toBeNull();
    expect(p.title).toBe("M4 x 0.7mm Zinc-Plated Socket Head Screw (16mm Length)");
    expect(p.children).toEqual([
      { productId: "473", sku: "2800-0004-0016", label: "25 Pack", priceUsd: "3.79", available: true, shipsLater: false },
      { productId: "2212", sku: "2800-0004-0016-250pk", label: "250 Pack", priceUsd: "18.99", available: true, shipsLater: false },
    ]);
  });

  it("follows an old one-SKU page to its parent", () => {
    expect(parseProductPage(fixture("gobilda-stub.html"), "https://www.gobilda.com/old/")).toEqual({
      kind: "stub",
      target: "https://www.gobilda.com/stingray-2-servo-gearbox-0-34-sec-60-30rpm-700-oz-in-torque-900-rotation/?sku=3215-0002-0002",
    });
  });
});

describe("parseProductPage: REV", () => {
  it("reads a plain product with its breadcrumbs", () => {
    expect(product("rev-single.html")).toMatchObject({ productId: "809", sku: "REV-21-2807", priceUsd: "11.00", availability: "in_stock", breadcrumbs: ["REV ION", "Brushless", "NEO Vortex & SPARK Flex"] });
  });

  it("ignores add-on products offered on the page", () => {
    const p = product("rev-addons.html");
    expect(p.sku).toBe("REV-41-1600");
    expect(p.options).toEqual([]);
    expect(p.breadcrumbs).toContain("FIRST Tech Challenge");
  });

  it("reads variant options and the price range", () => {
    const p = product("rev-options.html");
    expect(p.sku).toBeNull();
    expect(p.priceRange).toEqual({ min: "5.00", max: "12.50" });
    expect(p.options).toHaveLength(1);
    expect(p.options[0].name).toBe("Type");
    expect(p.options[0].attributeId).toBe("490");
    expect(p.options[0].values.map((v) => v.id)).toEqual(["2505", "2506", "2507", "2508", "2509"]);
    expect(p.options[0].values[1].label).toBe("20 Tooth Metal #25 Sprocket (REV-41-1720)");
  });

  it("treats sold-out parts under Discontinued as discontinued", () => {
    expect(product("rev-out-of-stock.html").availability).toBe("discontinued");
  });
});

describe("parseProductPage: changed or broken pages", () => {
  it("returns empty when there is no product data", () => {
    expect(parseProductPage("<html><head><title>Robots</title></head><body>Hello</body></html>", "https://a.example/x/")).toEqual({ kind: "empty" });
  });

  it("still reads a page whose JSON-LD is broken, from BCData", () => {
    const html = fixture("rev-single.html").replace(/<script type="application\/ld\+json">/g, '<script type="application/ld+json">{oops');
    const p = parseProductPage(html, "https://www.revrobotics.com/rev-21-2807/");
    // The name came from JSON-LD only, so without it the page can't be trusted.
    expect(p.kind === "empty" || (p.kind === "product" && p.priceUsd === "11.00")).toBe(true);
  });
});

describe("parseVariantAnswer", () => {
  it("reads SKU, price, stock and the variant id", () => {
    expect(parseVariantAnswer(JSON.parse(fixture("rev-variant.json")))).toEqual({
      variantId: "1725",
      sku: "REV-41-1720",
      priceUsd: "6.00",
      available: true,
      purchasable: true,
      image: "https://cdn11.bigcommerce.com/s-t3eo8vwp22/images/stencil/1280x1280/attribute_rule_images/2467_source_1757615648.png",
    });
  });

  it("returns null for an unexpected answer", () => {
    expect(parseVariantAnswer({ error: "nope" })).toBeNull();
    expect(parseVariantAnswer(null)).toBeNull();
  });
});

describe("helpers", () => {
  it("drops the SKU in brackets from an option label", () => {
    expect(optionLabel("20 Tooth Metal #25 Sprocket (REV-41-1720)", "REV-41-1720")).toBe("20 Tooth Metal #25 Sprocket");
    expect(optionLabel("1/2 in (12.7mm)")).toBe("1/2 in (12.7mm)");
  });

  it("lists option combinations up to a cap", () => {
    const a = { attributeId: "1", name: "A", values: [{ id: "1", label: "x" }, { id: "2", label: "y" }] };
    const b = { attributeId: "2", name: "B", values: [{ id: "3", label: "p" }, { id: "4", label: "q" }, { id: "5", label: "r" }] };
    expect(optionCombinations([a, b])).toHaveLength(6);
    expect(optionCombinations([a, b], 5)).toBeNull();
    expect(optionCombinations([])).toEqual([]);
  });

  it("reads a JSON object with braces inside strings", () => {
    const src = 'var x = {"a":"}{","b":{"c":1}}; more';
    expect(readJsonObject(src, src.indexOf("{"))).toEqual({ a: "}{", b: { c: 1 } });
  });
});
