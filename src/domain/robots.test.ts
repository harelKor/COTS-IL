import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots } from "./robots";

const UA = "COTS-IL-catalog-sync/1.0 (+https://cots-il.vercel.app)";

describe("robots.txt", () => {
  it("lets us read REV's product pages, sitemap and option endpoint, not its cart", () => {
    const rules = parseRobots(readFileSync(new URL("./__fixtures__/bigcommerce/rev-robots.txt", import.meta.url), "utf8"), UA);
    expect(rules.crawlDelaySeconds).toBeNull();
    expect(isAllowed(rules, "/rev-21-2807/")).toBe(true);
    expect(isAllowed(rules, "/xmlsitemap.php?type=products&page=1")).toBe(true);
    expect(isAllowed(rules, "/remote/v1/product-attributes/909")).toBe(true);
    expect(isAllowed(rules, "/cart.php")).toBe(false);
    expect(isAllowed(rules, "/remote.php")).toBe(false);
    expect(isAllowed(rules, "/x/?_bc_fsnf=1&a")).toBe(false);
  });

  it("uses our own group when there is one", () => {
    const rules = parseRobots("User-agent: *\nDisallow:\n\nUser-agent: COTS-IL-catalog-sync\nCrawl-delay: 5\nDisallow: /", UA);
    expect(rules.crawlDelaySeconds).toBe(5);
    expect(isAllowed(rules, "/anything")).toBe(false);
  });

  it("lets the longer Allow win, and honours $", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /shop/\nAllow: /shop/public/\nDisallow: /*.pdf$", UA);
    expect(isAllowed(rules, "/shop/public/a")).toBe(true);
    expect(isAllowed(rules, "/shop/private")).toBe(false);
    expect(isAllowed(rules, "/files/a.pdf")).toBe(false);
    expect(isAllowed(rules, "/files/a.pdf?x")).toBe(true);
  });

  it("allows everything with no robots.txt", () => {
    expect(isAllowed(parseRobots("", UA), "/x")).toBe(true);
  });
});
