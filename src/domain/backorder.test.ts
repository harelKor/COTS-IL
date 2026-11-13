import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { etaHebrew, parseCtreSection, parseWcpSection } from "./backorder";

const fixture = (name: string) => readFileSync(join(__dirname, "__fixtures__", name), "utf8");

describe("parseWcpSection", () => {
  it("reads a backordered Kraken X44 (continue, nothing on hand)", () => {
    const r = parseWcpSection(fixture("wcp-kraken-x44-section.html"));
    expect([...r.shipsLater]).toEqual([["45750556000468", true]]);
    expect(r.eta).toBeNull();
  });

  it("treats stock on hand as in stock, and continue at zero as ships later", () => {
    const r = parseWcpSection(fixture("wcp-in-stock-section.html"));
    expect(Object.fromEntries(r.shipsLater)).toEqual({ "111": false, "222": false, "333": true });
  });

  it("finds nothing in a page without the variable", () => {
    expect(parseWcpSection("<html></html>").shipsLater.size).toBe(0);
  });
});

describe("parseCtreSection", () => {
  it("reads backorder and its ETA", () => {
    const r = parseCtreSection(fixture("ctre-kraken-x44-section.html"));
    expect([...r.shipsLater]).toEqual([["43884685131949", true]]);
    expect(r.eta).toBe("late November");
  });

  it("reads an in-stock part with no ETA", () => {
    const r = parseCtreSection(fixture("ctre-kraken-wire-bundle-section.html"));
    expect([...r.shipsLater]).toEqual([["43915367186605", false]]);
    expect(r.eta).toBeNull();
  });
});

describe("etaHebrew", () => {
  it("translates month phrases", () => {
    expect(etaHebrew("late November")).toBe("סוף נובמבר");
    expect(etaHebrew("early January")).toBe("תחילת ינואר");
    expect(etaHebrew("end of March")).toBe("סוף מרץ");
    expect(etaHebrew("December")).toBe("דצמבר");
  });

  it("keeps other text and empties", () => {
    expect(etaHebrew("2-3 weeks")).toBe("2-3 weeks");
    expect(etaHebrew(null)).toBeNull();
    expect(etaHebrew("")).toBeNull();
  });
});
