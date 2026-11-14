import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

const runs = (url: string, headers: Record<string, string> = {}) => unstable_doesMiddlewareMatch({ config, url, headers });

describe("proxy matcher", () => {
  it("runs for pages, private paths and the APIs that use the session", () => {
    for (const url of ["/", "/v/andymark", "/catalog?category=gears", "/catalog/p/steel-spur-gear-20-dp", "/admin", "/orders/1", "/team", "/api/team-name", "/auth/confirm"]) {
      expect(runs(url), url).toBe(true);
    }
  });

  it("skips static files, metadata routes and the public catalog APIs", () => {
    for (const url of [
      "/_next/static/chunks/a.js",
      "/orbit-1690-tall.avif",
      "/vendors/andymark.svg",
      "/icon-192.png",
      "/favicon.ico",
      "/manifest.webmanifest",
      "/robots.txt",
      "/sitemap.xml",
      "/opengraph-image",
      "/api/search?q=falcon",
      "/api/catalog?page=2",
      "/api/discover?page=1",
      "/api/family/123/variants",
    ]) {
      expect(runs(url), url).toBe(false);
    }
  });

  it("skips router prefetches, not navigations", () => {
    expect(runs("/admin", { "next-router-prefetch": "1" })).toBe(false);
    expect(runs("/v/wcp", { purpose: "prefetch" })).toBe(false);
    expect(runs("/admin", { rsc: "1" })).toBe(true);
  });
});
