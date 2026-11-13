import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProductPage, type BcProductPage } from "../domain/bigcommerce";
import { fetchBigCommerceCatalog, normalizeBcProduct } from "./bigcommerce";

const fixture = (name: string) => readFileSync(new URL(`../domain/__fixtures__/bigcommerce/${name}`, import.meta.url), "utf8");
const page = (name: string, url: string) => parseProductPage(fixture(name), url) as BcProductPage;

describe("normalizeBcProduct", () => {
  it("makes one variant per goBILDA child, keyed by the child's product id", () => {
    const p = normalizeBcProduct(page("gobilda-parent.html", "https://www.gobilda.com/m4-x-0-7mm-zinc-plated-socket-head-screw-16mm-length/"), null, ["FTC"]);
    expect(p.supplierProductId).toBe("2219");
    expect(p.handle).toBe("m4-x-0-7mm-zinc-plated-socket-head-screw-16mm-length");
    expect(p.variants.map((v) => [v.supplierVariantId, v.supplierSku, v.options[0].value, v.priceUsd])).toEqual([
      ["p473", "2800-0004-0016", "25 Pack", "3.79"],
      ["p2212", "2800-0004-0016-250pk", "250 Pack", "18.99"],
    ]);
    expect(p.categorySlug).toBe("fasteners");
    expect(p.programs).toEqual(["FTC"]);
    expect(p.status).toBe("published");
  });

  it("hides a discontinued product", () => {
    const p = normalizeBcProduct(page("gobilda-discontinued.html", "https://www.gobilda.com/x/"), null, ["FTC"]);
    expect(p.status).toBe("hidden");
    expect(p.variants[0]).toMatchObject({ supplierVariantId: "p1036", available: false });
  });

  it("uses REV's option answers as variants, without the SKU in the label", () => {
    const p = normalizeBcProduct(
      page("rev-options.html", "https://www.revrobotics.com/DUO-25-metal-sprockets/"),
      [{ labels: [{ name: "Type", value: "20 Tooth Metal #25 Sprocket (REV-41-1720)" }], answer: { variantId: "1725", sku: "REV-41-1720", priceUsd: "6.00", available: true, purchasable: true, image: null } }],
      ["FRC", "FTC"],
    );
    expect(p.variants).toEqual([
      expect.objectContaining({ supplierVariantId: "v1725", supplierSku: "REV-41-1720", priceUsd: "6.00", options: [{ name: "Type", value: "20 Tooth Metal #25 Sprocket" }] }),
    ]);
    expect(p.categorySlug).toBe("belts-chain");
  });

  it("leaves a product whose options couldn't be read for the admin to review, at its lowest price", () => {
    const p = normalizeBcProduct(page("rev-options.html", "https://www.revrobotics.com/DUO-25-metal-sprockets/"), null, ["FRC", "FTC"]);
    expect(p.status).toBe("review");
    expect(p.variants).toEqual([expect.objectContaining({ supplierVariantId: "p909", priceUsd: "5.00" })]);
  });

  it("narrows REV's programs from its breadcrumbs", () => {
    expect(normalizeBcProduct(page("rev-addons.html", "https://www.revrobotics.com/rev-41-1600/"), null, ["FRC", "FTC"]).programs).toEqual(["FTC"]);
  });

  it("marks backorder as available but shipping later", () => {
    const base = page("rev-single.html", "https://www.revrobotics.com/rev-21-2807/");
    const p = normalizeBcProduct({ ...base, availability: "backorder", eta: "Expected to ship late November" }, null, ["FRC"]);
    expect(p.variants[0]).toMatchObject({ available: true, shipsLater: true, shipsLaterEta: "Expected to ship late November" });
  });
});

/** A fake store answering from fixtures, recording what was asked. */
function fakeStore(pages: Record<string, string | number>) {
  const asked: string[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push(`${init?.method ?? "GET"} ${url}`);
    const body = pages[url];
    if (body === undefined) return new Response("not found", { status: 404 });
    if (typeof body === "number") return new Response("", { status: body });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
  return { asked, fetchImpl };
}

const base = "https://www.revrobotics.com";
const quick = { minIntervalMs: 0, wait: async () => {} };

describe("fetchBigCommerceCatalog", () => {
  it("reads the sitemap, every page and each option", async () => {
    const store = fakeStore({
      [`${base}/robots.txt`]: fixture("rev-robots.txt"),
      [`${base}/xmlsitemap.php?type=products&page=1`]: `<urlset><url><loc>${base}/rev-21-2807/</loc></url><url><loc>${base}/DUO-25-metal-sprockets/</loc></url></urlset>`,
      [`${base}/rev-21-2807/`]: fixture("rev-single.html"),
      [`${base}/DUO-25-metal-sprockets/`]: fixture("rev-options.html"),
      [`${base}/remote/v1/product-attributes/909`]: fixture("rev-variant.json"),
    });
    const result = await fetchBigCommerceCatalog(base, ["FRC", "FTC"], { ...quick, fetchImpl: store.fetchImpl });
    expect(result.products.map((p) => p.supplierProductId)).toEqual(["809", "909"]);
    // Five option values: five lookups. The fake store gives the same answer, so they collapse to one variant id.
    expect(store.asked.filter((a) => a.startsWith("POST"))).toHaveLength(5);
    expect(result.stats).toMatchObject({ mode: "full", sitemapUrls: 2, pages: 2, parsed: 2, variantCalls: 5, variantFailures: 0 });
  });

  it("refuses to apply a run where the pages stopped making sense", async () => {
    const urls = Array.from({ length: 10 }, (_, i) => `${base}/p${i}/`);
    const store = fakeStore({
      [`${base}/robots.txt`]: "",
      [`${base}/xmlsitemap.php?type=products&page=1`]: `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`,
      ...Object.fromEntries(urls.map((u) => [u, "<html><body>New look!</body></html>"])),
    });
    await expect(fetchBigCommerceCatalog(base, ["FRC"], { ...quick, fetchImpl: store.fetchImpl })).rejects.toThrow(/page layout/);
  });

  it("stops when robots.txt forbids product pages", async () => {
    const store = fakeStore({
      [`${base}/robots.txt`]: "User-agent: *\nDisallow: /",
    });
    await expect(fetchBigCommerceCatalog(base, ["FRC"], { ...quick, fetchImpl: store.fetchImpl })).rejects.toThrow(/robots/);
  });

  it("gives up after repeated 429s", async () => {
    const store = fakeStore({ [`${base}/robots.txt`]: "", [`${base}/xmlsitemap.php?type=products&page=1`]: 429 });
    await expect(fetchBigCommerceCatalog(base, ["FRC"], { ...quick, fetchImpl: store.fetchImpl })).rejects.toThrow(/Rate-limited/);
  });

  it("refreshes only the pages it's given, following stubs", async () => {
    const gb = "https://www.gobilda.com";
    const parent = `${gb}/stingray-2-servo-gearbox-0-34-sec-60-30rpm-700-oz-in-torque-900-rotation/`;
    const store = fakeStore({ [`${gb}/robots.txt`]: "", [`${gb}/old/`]: fixture("gobilda-stub.html"), [parent]: fixture("gobilda-parent.html") });
    const result = await fetchBigCommerceCatalog(gb, ["FTC"], { ...quick, fetchImpl: store.fetchImpl, urls: [`${gb}/old/`] });
    expect(store.asked).not.toContain(`GET ${gb}/xmlsitemap.php?type=products&page=1`);
    expect(result.products).toHaveLength(1);
    expect(result.stats).toMatchObject({ mode: "refresh", stubs: 1, parsed: 1 });
  });
});
