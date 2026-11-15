import { describe, expect, it } from "vitest";
import { classifyDoc, documentLinks, quickDocs } from "./doc-links";

const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();

describe("classifyDoc on links seen in supplier descriptions", () => {
  it("names a performance report PDF a datasheet, not its banner text", () => {
    const doc = classifyDoc("https://ctre.download/files/datasheet/Motor%20Performance%20Analysis%20Report.pdf", "Latest Motor Performance Analysis Report is now available!");
    expect(doc).toMatchObject({ type: "datasheet", label: "גיליון נתונים", source: "Motor Performance Analysis Report.pdf" });
    expect(doc?.text).toBe("Latest Motor Performance Analysis Report is now available!");
  });

  it("reads a docs site as the user guide (Kraken)", () => {
    expect(classifyDoc("https://docs.wcproducts.com/welcome/electronics/kraken-x60", "Access User Guide, Kit Contents & More!")).toMatchObject({
      type: "guide",
      label: "מדריך למשתמש",
      source: "docs.wcproducts.com",
    });
  });

  it("reads EVO's ratio PDF as a ratio chart", () => {
    expect(classifyDoc("https://files.andymark.com/PDFs/EVO+Shifter+Ratio+Chart.pdf", "additional C ratio choice")).toMatchObject({
      type: "chart",
      label: "טבלת יחסי העברה",
      source: "EVO Shifter Ratio Chart.pdf",
    });
  });

  it("reads REV's pinion guide PDF as a guide", () => {
    expect(classifyDoc("https://www.revrobotics.com/content/docs/REV-21-1650-PG.pdf", "Please follow the NEO Press Fit Pinion Guide")?.type).toBe("guide");
  });

  it("knows CAD and drawings", () => {
    expect(classifyDoc("https://cad.onshape.com/documents/abc", "Onshape")?.type).toBe("cad");
    expect(classifyDoc("https://files.andymark.com/am-4541.STEP", "")?.type).toBe("cad");
    expect(classifyDoc("https://example.com/files/am-4541.zip", "STEP files")?.type).toBe("cad");
    expect(classifyDoc("https://example.com/files/am-4541-drawing.pdf", "Drawing")?.type).toBe("drawing");
    expect(classifyDoc("https://docs.example.com/step-by-step", "Step by step")?.type).toBe("guide");
  });

  it("drops promotional links that open no file or docs page", () => {
    expect(classifyDoc("https://store.ctr-electronics.com/pages/kraken-motors?_pos=1", "Compare with the Kraken X44 motor.")).toBeNull();
    expect(classifyDoc("https://store.ctr-electronics.com/collections/talon-fx", "Talon FX")).toBeNull();
    expect(classifyDoc("https://store.ctr-electronics.com/pages/software", "Phoenix")).toBeNull();
    expect(classifyDoc("http://files.example.com/a.pdf", "PDF")).toBeNull();
  });
});

describe("documentLinks", () => {
  it("lists each document once, CAD first", () => {
    const html = `<a href="https://docs.wcproducts.com/kraken">Guide</a> <a href="https://x.com/files/a.step">CAD</a> <a href="https://docs.wcproducts.com/kraken">Again</a> <a href="https://store.example.com/products/b">Buy</a>`;
    const docs = documentLinks(html, text);
    expect(docs.map((d) => d.type)).toEqual(["cad", "guide"]);
    expect(quickDocs(docs, "Kraken X60 Powered by TalonFX")).toMatchObject({ cad: { href: "https://x.com/files/a.step" }, guide: { href: "https://docs.wcproducts.com/kraken" } });
  });

  it("keeps another part's guide and a stray CAD link out of the buy box", () => {
    const html = `<a href="https://www.revrobotics.com/content/docs/REV-21-1650-PG.pdf">Please follow the NEO Press Fit Pinion Guide</a> <a href="https://cad.onshape.com/documents/1">community-driven tool</a>`;
    const docs = documentLinks(html, text, "EVO Shifter");
    expect(quickDocs(docs, "EVO Shifter")).toEqual({ cad: null, guide: null });
    expect(docs.find((d) => d.type === "guide")?.label).toBe("מדריך נלווה");
    expect(documentLinks(`<a href="https://docs.wcproducts.com/kraken-x60/">Kraken X60 Powered by TalonFX</a>`, text, "Kraken X60 Powered by TalonFX")[0].label).toBe("מדריך למשתמש");
  });

  it("decodes &amp; in addresses", () => {
    expect(documentLinks(`<a href="https://docs.x.com/a?b=1&amp;c=2">Docs</a>`, text)[0].href).toBe("https://docs.x.com/a?b=1&c=2");
  });
});
