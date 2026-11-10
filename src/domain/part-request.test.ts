import { describe, expect, it } from "vitest";
import { parsePartRequest } from "./part-request";

const req = (url: string, note = "", query = "") => parsePartRequest({ url, note, query });

describe("parsePartRequest", () => {
  it("takes a full link and tidies the note", () => {
    expect(req("https://wcproducts.com/products/wcp-0749", "   4 of these ", "wcp 749")).toEqual({
      ok: true,
      value: { url: "https://wcproducts.com/products/wcp-0749", note: "4 of these", query: "wcp 749" },
    });
  });

  it("adds https:// to a pasted address", () => {
    expect(req("andymark.com/products/am-3430")).toMatchObject({ ok: true, value: { url: "https://andymark.com/products/am-3430", note: null, query: null } });
  });

  it("refuses empty text, other schemes and words", () => {
    expect(req("  ").ok).toBe(false);
    expect(req("javascript:alert(1)").ok).toBe(false);
    expect(req("ftp://example.com/x").ok).toBe(false);
    expect(req("kraken motor").ok).toBe(false);
    expect(req(`https://x.com/${"a".repeat(2001)}`).ok).toBe(false);
  });
});
