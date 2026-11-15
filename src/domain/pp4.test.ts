import { describe, expect, it } from "vitest";
import { docName, docTiles, sourceTag, type DocLink } from "./doc-links";
import { thumbColumns } from "./gallery";
import { blendedTheme, contrastRatio, vendorPalette } from "./vendors";

/** The product page's lower half (PP4): thumbnails, the vendors' colours and the document tiles. */

const NIGHT = "#020416";

describe("thumbColumns", () => {
  it("never leaves a lone pair or one photo on a row of its own", () => {
    for (let n = 2; n <= 12; n++) {
      const cols = thumbColumns(n);
      const last = n % cols || cols;
      if (n > cols) expect(last, `${n} photos`).toBeGreaterThanOrEqual(cols - 1);
      expect(Math.ceil(n / cols), `${n} photos`).toBeLessThanOrEqual(2);
    }
    expect(thumbColumns(3)).toBe(6);
    expect(thumbColumns(8)).toBe(8);
    expect(thumbColumns(9)).toBe(5);
    expect(thumbColumns(12)).toBe(6);
  });
});

describe("blendedTheme", () => {
  it("one vendor: its whole palette, with the pair set to it twice", () => {
    const t = blendedTheme([{ code: "andymark", name: "AndyMark" }])!;
    expect(t.single).toBe(true);
    expect(t.style["--vendor-primary"]).toBe("#ef4444");
    expect(t.style["--pa-rgb"]).toBe("239 68 68");
    expect(t.style["--pb-rgb"]).toBe(t.style["--pa-rgb"]);
    // Each text tint as a pair, the night canvas's and daylight's (LM1).
    expect(t.style["--pa-text-dark"]).toBe("#fca5a5");
    expect(t.style["--pa-text-light"]).toBe("#b91c1c");
  });

  it("two vendors: both colours, first then second, and none of the site tokens re-pointed", () => {
    const t = blendedTheme([
      { code: "wcp", name: "WCP" },
      { code: "ctre", name: "CTRE" },
    ])!;
    expect(t.single).toBe(false);
    expect(t.style["--pa-rgb"]).toBe("37 99 235");
    expect(t.style["--pb-rgb"]).toBe("132 204 22");
    expect(t.style["--vendor-primary"]).toBeUndefined();
  });

  it("none for a part with no vendor", () => {
    expect(blendedTheme([])).toBeUndefined();
  });

  it("every vendor's text tint reads on the night canvas (AA)", () => {
    for (const code of ["andymark", "ctre", "gobilda", "wcp", "rev", "sds", "ttb", "someone-new"]) {
      const p = vendorPalette({ code, name: code, accentColor: "#7c3aed" });
      expect(contrastRatio(p.text, NIGHT), code).toBeGreaterThanOrEqual(4.5);
    }
  });
});

const doc = (href: string, label: string, text = "", type: DocLink["type"] = "guide"): DocLink => ({ href, label, text, type, source: "" });

describe("sourceTag", () => {
  it("says the file type or the service, never a hostname", () => {
    expect(sourceTag("https://ctre.download/files/datasheet/Motor%20Performance%20Analysis%20Report.pdf")).toBe("PDF");
    expect(sourceTag("https://files.example.com/a/b/part.stp")).toBe("STEP");
    expect(sourceTag("https://drive.google.com/file/d/1AbC/view")).toBe("Google Drive");
    expect(sourceTag("https://docs.google.com/spreadsheets/d/1AbC/edit")).toBe("Google Sheets");
    expect(sourceTag("https://docs.google.com/document/d/1AbC/edit")).toBe("Google Docs");
    expect(sourceTag("https://cad.onshape.com/documents/abc")).toBe("Onshape");
    expect(sourceTag("https://docs.wcproducts.com/welcome/electronics/kraken-x60")).toBe("אתר תיעוד");
  });
});

describe("docName", () => {
  it("keeps a real name, skips banners, codes and ids", () => {
    expect(docName({ href: "https://x.com/a.pdf", text: "Kraken X60 User Guide" })).toBe("Kraken X60 User Guide");
    expect(docName({ href: "https://files.andymark.com/PDFs/EVO+Shifter+Ratio+Chart.pdf", text: "additional C ratio choice!" })).toBe("EVO Shifter Ratio Chart");
    expect(docName({ href: "https://www.revrobotics.com/content/docs/REV-21-1650-PG.pdf", text: "Please follow the NEO Press Fit Pinion Guide" })).toBeNull();
    expect(docName({ href: "https://drive.google.com/file/d/1AbCdEf/view", text: "Click here" })).toBeNull();
  });
});

describe("docTiles", () => {
  it("one of a kind keeps its Hebrew label: the Kraken's guide and datasheet", () => {
    const tiles = docTiles([
      doc("https://docs.wcproducts.com/welcome/electronics/kraken-x60", "מדריך למשתמש", "Access User Guide, Kit Contents & More!"),
      doc("https://ctre.download/files/datasheet/Motor%20Performance%20Analysis%20Report.pdf", "גיליון נתונים", "Latest Motor Performance Analysis Report is now available!", "datasheet"),
    ]);
    expect(tiles.map((t) => [t.title, t.tag])).toEqual([
      ["מדריך למשתמש", "אתר תיעוד"],
      ["גיליון נתונים", "PDF"],
    ]);
  });

  it("two of one label: their own names, or numbers; never one title twice", () => {
    const tiles = docTiles([
      doc("https://docs.google.com/document/d/1aa/edit", "מדריך למשתמש", "MK5n Assembly Guide"),
      doc("https://drive.google.com/file/d/1bb/view", "מדריך למשתמש", "Click here"),
      doc("https://docs.google.com/document/d/1cc/edit", "מדריך נלווה", "Click here"),
      doc("https://drive.google.com/file/d/1dd/view", "מדריך נלווה", "Download"),
    ]);
    expect(tiles.map((t) => t.title)).toEqual(["MK5n Assembly Guide", "מדריך למשתמש 2", "מדריך נלווה 1", "מדריך נלווה 2"]);
    expect(tiles[0].kind).toBe("מדריך למשתמש");
    expect(new Set(tiles.map((t) => t.title)).size).toBe(tiles.length);
    expect(tiles.every((t) => !/\.(com|io|net)\b/.test(t.tag))).toBe(true);
  });

  it("keeps the vendor each tile came from", () => {
    const [t] = docTiles([{ ...doc("https://x.com/a.pdf", "שרטוט", "", "drawing"), vendor: "wcp" }]);
    expect(t.vendor).toBe("wcp");
  });
});
