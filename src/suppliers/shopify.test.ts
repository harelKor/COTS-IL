import { describe, expect, it } from "vitest";
import { normalizeProduct, sanitizeDescription, type ShopifyProduct } from "./shopify";

const raw: ShopifyProduct = {
  id: 1,
  handle: "toughbox",
  title: " ToughBox Mini ",
  body_html: "<p>Nice</p>",
  product_type: "Gearboxes",
  tags: ["New", " Gearboxes "],
  options: [{ name: "Ratio" }, { name: "Bore" }],
  images: [{ src: "https://cdn.example/a.jpg" }, { src: "http://cdn.example/b.jpg" }],
  variants: [
    { id: 10, sku: " am-1 ", option1: "10:1", option2: "Hex", price: "50.00", compare_at_price: "0.00", available: true, grams: 100 },
    { id: 11, sku: "", option1: "Default Title", price: "0.00", available: false },
  ],
};

describe("normalizeProduct", () => {
  const product = normalizeProduct(raw, "https://store.example", ["FRC"]);

  it("maps product fields", () => {
    expect(product).toMatchObject({
      supplierProductId: "1",
      title: "ToughBox Mini",
      url: "https://store.example/products/toughbox",
      tags: ["New", "Gearboxes"],
      categorySlug: "gearboxes",
      programs: ["FRC"],
      status: "published",
    });
  });

  it("keeps only https images", () => {
    expect(product.images).toEqual(["https://cdn.example/a.jpg"]);
  });

  it("maps variant options, empty SKUs and zero prices", () => {
    expect(product.variants[0]).toMatchObject({
      supplierVariantId: "10",
      supplierSku: "am-1",
      options: [
        { name: "Ratio", value: "10:1" },
        { name: "Bore", value: "Hex" },
      ],
      priceUsd: "50.00",
      compareAtUsd: null,
    });
    expect(product.variants[1]).toMatchObject({ supplierSku: null, options: [], priceUsd: null, available: false });
  });

  it("accepts tags as a comma-separated string", () => {
    expect(normalizeProduct({ ...raw, tags: "a, b" }, "https://s", ["FRC"]).tags).toEqual(["a", "b"]);
  });
});

describe("sanitizeDescription", () => {
  it("removes scripts, styles, event handlers and unsafe links", () => {
    const html = sanitizeDescription(
      '<p onclick="x()" style="color:red">Hi<script>alert(1)</script></p><iframe src="https://x"></iframe><a href="javascript:alert(1)">bad</a>',
    );
    expect(html).not.toMatch(/script|onclick|style|iframe/);
    expect(html).toContain("<p>Hi</p>");
  });

  it("opens links safely", () => {
    expect(sanitizeDescription('<a href="https://x.example">x</a>')).toContain('rel="noopener noreferrer nofollow"');
  });

  it("returns null for empty input", () => {
    expect(sanitizeDescription("")).toBeNull();
    expect(sanitizeDescription("<script>x</script>")).toBeNull();
  });
});
