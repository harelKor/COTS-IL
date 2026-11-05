import { describe, expect, it } from "vitest";
import { descriptionText, isRealDescription, metaDescription } from "./description";

describe("isRealDescription", () => {
  it("hides the supplier's reference-only placeholder", () => {
    expect(isRealDescription("<p><strong>This Page is for Reference Only</strong></p>")).toBe(false);
    expect(isRealDescription("<p>This page is for reference only. Please see the bundle.</p>")).toBe(false);
  });

  it("hides empty and near-empty text", () => {
    expect(isRealDescription(null)).toBe(false);
    expect(isRealDescription("<p>&nbsp;</p>")).toBe(false);
    expect(isRealDescription("<p>Coming soon</p>")).toBe(false);
  });

  it("keeps a real description", () => {
    expect(isRealDescription("<p>20 DP steel spur gear with a 1/2&quot; hex bore, 0.5&quot; wide.</p>")).toBe(true);
  });
});

describe("descriptionText", () => {
  it("strips tags and decodes common entities", () => {
    expect(descriptionText("<ul><li>1/2&quot; Hex</li><li>#10-32 &amp; more</li></ul>")).toBe('1/2" Hex #10-32 & more');
  });
});

describe("metaDescription", () => {
  it("keeps short text as is", () => {
    expect(metaDescription("Short text.")).toBe("Short text.");
  });

  it("cuts long text on a word boundary", () => {
    const text = "word ".repeat(60).trim();
    const meta = metaDescription(text);
    expect(meta.length).toBeLessThanOrEqual(156);
    expect(meta.endsWith("word…")).toBe(true);
  });
});
