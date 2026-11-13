import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { draftSupplier, guessPrograms, isPublicHost, isSyncedPlatform, normalizeStoreUrl, pageLooksBigCommerce, parseStorePage, shopifyProductCount, sitemapProductCount, storeNameFromTitle, suggestCode, supplierRemoval } from "./supplier-detect";

const SHOPIFY_HOME = `<!doctype html><html><head>
  <title>REV Robotics &ndash; Building Blocks for FTC &amp; FRC</title>
  <meta property="og:site_name" content="REV Robotics">
  <meta property="og:image" content="//www.revrobotics.com/cdn/shop/files/rev-logo.png?v=1">
  <link rel="icon" type="image/png" href="/cdn/shop/files/favicon.png">
</head><body><p>Parts for FIRST Tech Challenge and FRC teams.</p></body></html>`;

const PLAIN_HOME = `<html><head><title>Home | Acme Robot Parts</title>
  <link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="shortcut icon" href="/favicon.ico">
</head><body>FTC kits</body></html>`;

const PRODUCTS_JSON = { products: [{ id: 1, handle: "ultraplanetary", title: "UltraPlanetary", variants: [{ id: 2 }] }] };

describe("normalizeStoreUrl", () => {
  it("keeps only the origin and adds https", () => {
    expect(normalizeStoreUrl("revrobotics.com/collections/ftc?x=1")).toBe("https://revrobotics.com");
    expect(normalizeStoreUrl(" https://WWW.Example.com/ ")).toBe("https://www.example.com");
    expect(normalizeStoreUrl("http://shop.example.co.il:8080/a")).toBe("http://shop.example.co.il:8080");
  });
  it("refuses other schemes, private hosts and junk", () => {
    for (const bad of ["", "ftp://x.com", "javascript:alert(1)", "localhost:3000", "http://127.0.0.1", "http://192.168.1.4", "http://10.0.0.1", "http://169.254.169.254", "https://user:pw@x.com", "not a url", "http://[::1]"]) {
      expect(normalizeStoreUrl(bad), bad).toBeNull();
    }
  });
  it("lets public IPs through", () => expect(isPublicHost("8.8.8.8")).toBe(true));
});

describe("parseStorePage", () => {
  it("prefers og:site_name and og:image, made absolute", () => {
    expect(parseStorePage(SHOPIFY_HOME, "https://www.revrobotics.com")).toEqual({
      name: "REV Robotics",
      logoUrl: "https://www.revrobotics.com/cdn/shop/files/rev-logo.png?v=1",
      logoCandidates: ["https://www.revrobotics.com/cdn/shop/files/rev-logo.png?v=1", "https://www.revrobotics.com/cdn/shop/files/favicon.png"],
    });
  });
  it("falls back to the title and the touch icon", () => {
    expect(parseStorePage(PLAIN_HOME, "https://acme.example")).toMatchObject({ name: "Acme Robot Parts", logoUrl: "https://acme.example/apple-touch-icon.png" });
  });
  it("falls back to the favicon, and to nothing", () => {
    expect(parseStorePage(`<link href="/f.ico" rel="shortcut icon">`, "https://a.example").logoUrl).toBe("https://a.example/f.ico");
    expect(parseStorePage("<html></html>", "https://a.example")).toEqual({ name: null, logoUrl: null, logoCandidates: [] });
  });
  it("takes the store's part of a title", () => {
    expect(storeNameFromTitle("Home – West Coast Products")).toBe("West Coast Products");
    expect(storeNameFromTitle("goBILDA")).toBe("goBILDA");
    expect(storeNameFromTitle("Redux Robotics | Industrial Grade Electronics", "shop.reduxrobotics.com")).toBe("Redux Robotics");
    expect(storeNameFromTitle("Swerve Modules – Acme Robot Parts", "acmerobotparts.com")).toBe("Acme Robot Parts");
  });
});

describe("shopifyProductCount", () => {
  it("counts a Shopify product list", () => {
    expect(shopifyProductCount(PRODUCTS_JSON)).toBe(1);
    expect(shopifyProductCount({ products: [] })).toBe(0);
  });
  it("is null for anything else", () => {
    for (const other of [null, "<html>", {}, { products: "x" }, { products: [{ name: "x" }] }, [1, 2]]) expect(shopifyProductCount(other)).toBeNull();
    // A headless store's look-alike feed: text ids, so the sync would skip every product.
    expect(shopifyProductCount({ products: [{ id: "canandmag", handle: "helium-canandmag", variants: [{ id: "helium-canandmag" }] }] })).toBeNull();
  });
});

describe("suggestCode", () => {
  it("uses a short name, else the host", () => {
    expect(suggestCode("REV Robotics", "www.revrobotics.com", [])).toBe("revrobotics");
    expect(suggestCode("The Best Robot Parts Company Ltd", "bestparts.co.il", [])).toBe("bestparts");
    expect(suggestCode(null, "gobilda.com", [])).toBe("gobilda");
    expect(suggestCode(null, "shop.reduxrobotics.com", [])).toBe("reduxrobotics");
  });
  it("never repeats a taken code", () => {
    expect(suggestCode("WCP", "wcproducts.com", ["wcp", "wcp2"])).toBe("wcp3");
  });
});

describe("guessPrograms", () => {
  it("reads FTC and FRC from the page", () => {
    expect(guessPrograms(SHOPIFY_HOME)).toEqual(["FRC", "FTC"]);
    expect(guessPrograms(PLAIN_HOME)).toEqual(["FTC"]);
    expect(guessPrograms("<p>motors</p>")).toEqual(["FRC"]);
  });
});

describe("draftSupplier", () => {
  it("is Shopify when /products.json lists products", () => {
    expect(draftSupplier({ baseUrl: "https://www.revrobotics.com", html: SHOPIFY_HOME, productsJson: PRODUCTS_JSON, takenCodes: ["wcp"] })).toEqual({
      code: "revrobotics",
      name: "REV Robotics",
      baseUrl: "https://www.revrobotics.com",
      logoUrl: "https://www.revrobotics.com/cdn/shop/files/rev-logo.png?v=1",
      platform: "shopify",
      programs: ["FRC", "FTC"],
      sampleProducts: 1,
    });
  });
  it("is Shopify from the page when /products.json was throttled", () => {
    const html = `<title>Limelight Vision</title><link href="//limelightvision.io/cdn/shop/t/2/assets/base.css"><script src="https://cdn.shopify.com/s/trekkie.js"></script>`;
    expect(draftSupplier({ baseUrl: "https://limelightvision.io", html, productsJson: null, takenCodes: [] })).toMatchObject({ platform: "shopify", sampleProducts: null });
  });
  it("is BigCommerce from a Stencil page, counting the product sitemap", () => {
    const html = readFileSync(new URL("./__fixtures__/bigcommerce/rev-single.html", import.meta.url), "utf8");
    const sitemapXml = readFileSync(new URL("./__fixtures__/bigcommerce/rev-sitemap.xml", import.meta.url), "utf8");
    expect(pageLooksBigCommerce(html)).toBe(true);
    expect(pageLooksBigCommerce(PLAIN_HOME)).toBe(false);
    expect(draftSupplier({ baseUrl: "https://www.revrobotics.com", html, productsJson: null, takenCodes: ["rev"], sitemapXml })).toMatchObject({ platform: "bigcommerce", sampleProducts: 3 });
    expect(sitemapProductCount("<html>not a sitemap</html>")).toBeNull();
    expect(isSyncedPlatform("bigcommerce")).toBe(true);
    expect(isSyncedPlatform("manual")).toBe(false);
  });
  it("uses the logo the server checked", () => {
    expect(draftSupplier({ baseUrl: "https://acme.example", html: PLAIN_HOME, productsJson: null, takenCodes: [], logoUrl: null }).logoUrl).toBeNull();
  });
  it("is manual otherwise, and survives a page that didn't load", () => {
    expect(draftSupplier({ baseUrl: "https://acme.example", html: PLAIN_HOME, productsJson: null, takenCodes: [] })).toMatchObject({ platform: "manual", name: "Acme Robot Parts", sampleProducts: null });
    expect(draftSupplier({ baseUrl: "https://www.acme.example", html: null, productsJson: null, takenCodes: [] })).toMatchObject({ name: "acme.example", code: "acme", logoUrl: null, programs: ["FRC"] });
  });
});

describe("supplierRemoval", () => {
  it("deletes only without orders or supplier orders", () => {
    expect(supplierRemoval({ orderLines: 0, supplierOrders: 0 })).toBe("delete");
    expect(supplierRemoval({ orderLines: 3, supplierOrders: 0 })).toBe("hide-only");
    expect(supplierRemoval({ orderLines: 0, supplierOrders: 1 })).toBe("hide-only");
  });
});
