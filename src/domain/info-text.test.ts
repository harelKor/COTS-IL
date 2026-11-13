import { describe, expect, it } from "vitest";
import { DEFAULT_PAGES, INFO_PAGES, parseInfoText, parseInline, resolveInfo, unknownTokens } from "./info-text";

describe("info text", () => {
  it("parses bold, links and facts", () => {
    expect(parseInline("a **b** [c](/contact) {מכפיל}.")).toEqual([
      { t: "text", v: "a " },
      { t: "bold", v: "b" },
      { t: "text", v: " " },
      { t: "link", v: "c", href: "/contact" },
      { t: "text", v: " " },
      { t: "fact", name: "מכפיל", v: "" },
      { t: "text", v: "." },
    ]);
    // Only site paths and https links become links.
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ t: "text", v: "[x](javascript:alert(1))" }]);
  });

  it("splits intro, sections, paragraphs, lists and blocks", () => {
    const doc = parseInfoText("hi\n\n## A\none\ntwo\n\n- x\n- y\n{{איסוף}}\n## B\n");
    expect(doc.intro).toEqual([{ t: "p", inline: [{ t: "text", v: "hi" }] }]);
    expect(doc.sections[0].blocks.map((b) => b.t)).toEqual(["p", "list", "auto"]);
    expect(doc.sections[0].blocks[0]).toEqual({ t: "p", inline: [{ t: "text", v: "one two" }] });
    expect(doc.sections[1]).toEqual({ title: "B", blocks: [] });
  });

  it("hides what an empty fact leaves empty", () => {
    const doc = parseInfoText("## תשלום\n{תנאי תשלום}\n## משלוח\n{דמי טיפול}.\n\nטקסט{כולל}.\n{{איסוף}}");
    const r = resolveInfo(doc, { כולל: "" }, new Set());
    expect(r.sections.map((s) => s.title)).toEqual(["משלוח"]);
    expect(r.sections[0].blocks).toHaveLength(1);
    const full = resolveInfo(doc, { "תנאי תשלום": "העברה", "דמי טיפול": "₪30" }, new Set(["איסוף"]));
    expect(full.sections[0].blocks).toEqual([{ t: "p", inline: [{ t: "fact", name: "תנאי תשלום", v: "העברה" }] }]);
    expect(full.sections[1].blocks.map((b) => b.t)).toEqual(["p", "p", "auto"]);
  });

  it("flags unknown tokens and none in the built-in pages", () => {
    expect(unknownTokens("{מכפיל} {x} {{y}} {{איסוף}}")).toEqual(["x", "y"]);
    for (const p of INFO_PAGES) expect(unknownTokens(DEFAULT_PAGES[p.key])).toEqual([]);
  });
});

describe("banner", () => {
  it("shows while on, with text, until its last day", async () => {
    const { bannerShows } = await import("./content");
    const b = { enabled: true, text: "חג שמח", endsOn: "2026-11-20" };
    expect(bannerShows(b, "2026-11-20")).toBe(true);
    expect(bannerShows(b, "2026-11-21")).toBe(false);
    expect(bannerShows({ ...b, endsOn: null }, "2030-01-01")).toBe(true);
    expect(bannerShows({ ...b, enabled: false }, "2026-11-01")).toBe(false);
    expect(bannerShows({ ...b, text: "" }, "2026-11-01")).toBe(false);
  });
});
