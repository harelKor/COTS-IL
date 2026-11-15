import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanDescription, descriptionBlocks, descriptionText, dropStraySentences, isRealDescription, metaDescription } from "./description";

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





const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");
/** What a team must never see in our copy of a supplier's description. */
const FORBIDDEN = [/\$\s?\d/, /MSRP/i, /discount/i, /special offer/i, /@[\w-]+\.[a-z]/i, /\bcontact\b/i, /checkout/i, /add to cart/i, /pre-?order/i, /estimated ship/i, /\bdeal\b/i];

describe("cleanDescription on real supplier descriptions", () => {
  const pages = {
    "CTRE Kraken X60": fixture("ctre-kraken-x60.html"),
    "WCP Steel Spur Gear (20 DP)": fixture("wcp-steel-spur-gear-20dp.html"),
    "Thrifty Bot Pulsar 775": fixture("ttb-pulsar-775.html"),
    "Thrifty Bot Swerve": fixture("ttb-thrifty-swerve.html"),
  };

  for (const [name, html] of Object.entries(pages)) {
    it(`${name}: no promos, USD prices or supplier contacts`, () => {
      const { lead, more } = cleanDescription(html);
      const text = descriptionText(`${lead} ${more}`);
      expect(text.length).toBeGreaterThan(100);
      for (const p of FORBIDDEN) expect(text, String(p)).not.toMatch(p);
      // No links into the supplier's shop.
      expect(`${lead}${more}`).not.toMatch(/href="[^"]*\/(products|collections|pages)\//);
    });
  }

  it("Kraken X60: drops the offer section, keeps the features, moves the spec table", () => {
    const { lead, more, specs } = cleanDescription(pages["CTRE Kraken X60"]);
    const text = descriptionText(`${lead} ${more}`);
    expect(text).toContain("1,108W peak power");
    expect(text).toContain("Kit Contents");
    expect(text).not.toContain("non-transferable");
    expect(text).not.toContain("Compare with the Kraken X44");
    expect(specs).toContainEqual({ key: "Min/Max Voltage", value: "6V - 24V" });
    expect(specs.some((s) => s.key === "Parameter")).toBe(false);
    expect(text).not.toMatch(/Electrical/);
    expect(more.length).toBeGreaterThan(0);
  });

  it("Pulsar 775: the spec list moves to specs, the docs link stays", () => {
    const { lead, more, specs } = cleanDescription(pages["Thrifty Bot Pulsar 775"]);
    expect(specs).toContainEqual({ key: "Free Speed", value: "7500 RPM" });
    expect(`${lead}${more}`).toContain("docs.thethriftybot.com");
    expect(`${lead}${more}`).not.toContain("Free Speed");
  });

  it("WCP gear: a plain description stays whole, with no 'read more'", () => {
    const { lead, more, specs } = cleanDescription(pages["WCP Steel Spur Gear (20 DP)"]);
    expect(descriptionText(lead)).toContain("14.5 degree pressure angle");
    expect(more).toBe("");
    expect(specs).toEqual([]);
  });

  it("Stealth: no tab-label or empty bullets; its spec tab moves to specs", () => {
    const { lead, more, specs } = cleanDescription(fixture("andymark-stealth-sushi-wheels.html"));
    const html = `${lead}${more}`;
    expect(html).not.toMatch(/<li>\s*(Description|Specifications|Documentation)\s*<\/li>/);
    expect(html).not.toMatch(/<li>\s*<\/li>/);
    expect(html).not.toMatch(/<h3>(Specifications|Documentation)<\/h3>/);
    // A shop link inside a sentence keeps its words.
    expect(descriptionText(html)).toContain("Nub Bore Stealth Wheels feature a 4 bolt pattern");
    expect(specs.map((s) => s.key)).toEqual(["Bore", "Diameter", "Durometer", "Hole Pattern", "Material", "Weight", "Width"]);
    expect(specs).toContainEqual({ key: "Material", value: "TPU, Polycarbonate" });
  });

  it("EVO Shifter: tabs become headings, empty tabs and the support email go", () => {
    const { lead, more } = cleanDescription(fixture("andymark-evo-shifter.html"));
    const html = `${lead}${more}`;
    expect(html).not.toMatch(/<li>\s*(Description|Gearbox Ratios|What's in the Box\?)\s*<\/li>/);
    expect(html).toContain("<h3>What's in the Box?</h3>");
    expect(html).not.toMatch(/<li>\s*<\/li>/);
    expect(descriptionText(html)).toContain("4-tooth dog shifting method");
    expect(descriptionText(html)).not.toMatch(/support@|Refer to EVO/);
  });

  it("keeps a real short list that isn't a tab bar", () => {
    const { lead } = cleanDescription("<p>A sturdy part for robots, made of aluminum and steel.</p><ul><li>Features</li><li>Lightweight frame rail</li><li>Anodized blue</li></ul>");
    expect(lead).toContain("<li>Lightweight frame rail</li>");
  });

  it("a description of only sales talk leaves nothing", () => {
    expect(cleanDescription("<p>Buy now and save $50! Contact sales@example.com</p>").lead).toBe("");
  });
});

describe("descriptionText entities", () => {
  it("decodes &amp; in doc labels", () => {
    expect(descriptionText("Access User Guide, Kit Contents &amp; More!")).toBe("Access User Guide, Kit Contents & More!");
  });
});

describe("PP4: stray lines and the page's blocks", () => {
  const blocksOf = (name: string) => {
    const c = cleanDescription(fixture(name));
    return { blocks: descriptionBlocks(`${c.lead}\n${c.more}`), text: descriptionText(`${c.lead} ${c.more}`) };
  };
  const STRAY = [/click here/i, /lead[- ]?time/i, /business days/i, /scroll down/i, /read more/i, /bottom of the page/i];

  it("drops lead-time and click-here sentences but keeps the rest of their paragraph", () => {
    expect(dropStraySentences("<p>Great wheel. Please click here for the lead-time. It grips well.</p>")).toBe("<p>Great wheel. It grips well.</p>");
    expect(descriptionText(dropStraySentences('<p><a href="https://x.com">Click here</a> to apply for your discount today!</p>'))).toBe("");
    expect(dropStraySentences("<p>Line one<br />Leadtime: 2-3 weeks</p>")).toBe("<p>Line one</p>");
  });

  it("SDS MK5n: IMPORTANT and Note become callouts, the not-included list a feature grid, no 'scroll down'", () => {
    const { blocks, text } = blocksOf("sds-mk5n.html");
    for (const p of STRAY) expect(text).not.toMatch(p);
    const callouts = blocks.flatMap((b) => (b.kind === "callout" ? [b] : []));
    expect(callouts.map((b) => b.tone)).toEqual(["important", "note"]);
    expect(callouts[0].html).toMatch(/^The adjacent MK5n/);
    // "/am-5787" only works on AndyMark's own site.
    expect(callouts[0].html).not.toMatch(/<a\b/);
    const features = blocks.flatMap((b) => (b.kind === "features" ? [b] : []));
    expect(features[0].items.map((i) => i.title)).toEqual(["Drive motor", "Steering motor", "Steering encoder"]);
    expect(blocks.flatMap((b) => (b.kind === "heading" ? [b.text] : []))).toEqual(["Additional new features", "Other features"]);
  });

  it("EVO Shifter: no build-time paragraph, bold labels become headings, the shaft lists read as one", () => {
    const { blocks, text } = blocksOf("andymark-evo-shifter.html");
    for (const p of STRAY) expect(text).not.toMatch(p);
    expect(text).not.toMatch(/Availability:/);
    const headings = blocks.flatMap((b) => (b.kind === "heading" ? [b.text] : []));
    expect(headings).toEqual(expect.arrayContaining(["Improvements", "Air Cylinder Shifting", "Weight Range (Without Motors)", "Output Shaft"]));
    const shafts = blocks.at(-1);
    expect(shafts?.kind === "list" && shafts.items.length).toBe(3);
    expect(blocks.some((b, i) => b.kind === "heading" && blocks[i + 1]?.kind === "heading")).toBe(false);
  });

  it("Stealth: two paragraphs, then 'Product Usage' as a heading over its own", () => {
    const { blocks } = blocksOf("andymark-stealth-sushi-wheels.html");
    expect(blocks.map((b) => b.kind)).toEqual(["text", "heading", "text"]);
    expect(blocks[1].kind === "heading" && blocks[1].text).toBe("Product Usage");
  });

  it("a bold-lead list is a feature grid with its titles and text", () => {
    const [b] = descriptionBlocks("<ul><li><strong>Ball-Bearing-Based</strong><br />Less friction.</li><li><b>Modular:</b> Builds anything.</li></ul>");
    expect(b).toEqual({
      kind: "features",
      items: [
        { title: "Ball-Bearing-Based", html: "Less friction." },
        { title: "Modular", html: "Builds anything." },
      ],
    });
  });
});
