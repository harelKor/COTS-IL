import { describe, expect, it } from "vitest";
import { sized, shopifyImage } from "./images";

const BC = "https://cdn11.bigcommerce.com/s-x56mtydx1w/images/stencil/1280x1280/products/1036/5034/3204-0001.jpg";

describe("sized", () => {
  it("adds the width to Shopify photos", () => {
    expect(sized("https://cdn.shopify.com/s/files/a.jpg", 240)).toBe("https://cdn.shopify.com/s/files/a.jpg?width=240");
    expect(sized("https://cdn.shopify.com/s/files/a.jpg?v=1", 240)).toBe("https://cdn.shopify.com/s/files/a.jpg?v=1&width=240");
  });

  it("rewrites the stencil size of BigCommerce photos and keeps the rest", () => {
    expect(sized(BC, 240)).toBe("https://cdn11.bigcommerce.com/s-x56mtydx1w/images/stencil/240w/products/1036/5034/3204-0001.jpg");
    expect(sized(`${BC}?c=2`, 96)).toContain("/stencil/96w/products/1036/5034/3204-0001.jpg?c=2");
    expect(sized(BC.replace("1280x1280", "original"), 96)).toContain("/stencil/96w/");
    expect(sized(BC.replace("1280x1280", "500w"), 96)).toContain("/stencil/96w/");
  });

  it("leaves other hosts and other BigCommerce paths alone", () => {
    expect(sized("https://example.com/a.jpg", 240)).toBe("https://example.com/a.jpg");
    expect(sized("https://cdn11.bigcommerce.com/s-abc/product_images/a.jpg", 240)).toBe("https://cdn11.bigcommerce.com/s-abc/product_images/a.jpg");
  });
});

describe("shopifyImage", () => {
  it("gives BigCommerce photos a 1x and a 2x source", () => {
    const img = shopifyImage(BC, 48);
    expect(img.src).toContain("/stencil/48w/");
    expect(img.srcSet).toBe(`${img.src} 1x, ${sized(BC, 96)} 2x`);
    expect(img.srcSet).toContain("/stencil/96w/");
  });

  it("gives other hosts no srcSet", () => {
    expect(shopifyImage("https://example.com/a.jpg", 48)).toEqual({ src: "https://example.com/a.jpg", srcSet: undefined });
  });
});
