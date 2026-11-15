import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanDescription } from "@/lib/description";
import stealthRows from "./__fixtures__/stealth.json";
import beltRows from "./__fixtures__/timing-belt.json";
import { specLabel } from "./sort";
import { specRows } from "./spec-rows";

const description = (name: string) => cleanDescription(readFileSync(join(__dirname, "../../lib/__fixtures__", name), "utf8"));
const stealth = stealthRows.map((v) => ({ options: v.options as Record<string, string>, specs: [] }));
const belts = beltRows.map((v) => ({ options: v.options as Record<string, string>, specs: [{ key: "pitch", value: "HTD 5mm" }] }));
const value = (rows: ReturnType<typeof specRows>, label: string) => rows.find((r) => r.label === label)?.value;
const labels = (rows: ReturnType<typeof specRows>) => rows.map((r) => r.label);

describe("specLabel", () => {
  it("translates whole names, never half of one", () => {
    expect(specLabel("Material")).toBe("חומר");
    expect(specLabel("Weight")).toBe("משקל");
    expect(specLabel("Weight (lbs)")).toBe("משקל");
    expect(specLabel("Width")).toBe("רוחב");
    expect(specLabel("Hole Pattern")).toBe("תבנית חורים");
    expect(specLabel("Free Speed")).toBe("מהירות חופשית");
    expect(specLabel("Stall Torque")).toBe("מומנט עצירה");
    expect(specLabel("Stall Current")).toBe("זרם עצירה");
    expect(specLabel("Nominal Voltage")).toBe("מתח נומינלי");
    expect(specLabel("Min/Max Voltage")).toBe("טווח מתח");
  });

  it("keeps an unknown name in the supplier's words", () => {
    expect(specLabel("PWM Deadband")).toBe("PWM Deadband");
    expect(specLabel("PWM Input Pulse (High Time)")).toBe("PWM Input Pulse (High Time)");
  });
});

describe("specRows", () => {
  it("Stealth: options summarized before a choice, the description's specs beside them", () => {
    const rows = specRows(["bore", "diameter", "durometer"], stealth, description("andymark-stealth-sushi-wheels.html").specs);
    expect(labels(rows)).toEqual(["קדח", "קוטר", "קשיות", "תבנית חורים", "חומר", "משקל", "רוחב"]);
    expect(value(rows, "קדח")).toBe("4 אפשרויות");
    expect(value(rows, "קוטר")).toBe("4 אפשרויות");
    expect(value(rows, "חומר")).toBe("TPU, Polycarbonate");
    expect(value(rows, "רוחב")).toBe("1 in.");
    // One row per name: the description's own Bore, Diameter and Durometer lines give way to the options.
    expect(new Set(labels(rows)).size).toBe(rows.length);
  });

  it("Stealth: a chosen option shows its value", () => {
    const left = stealth.filter((v) => v.options.bore === "1/2 in Hex" && v.options.durometer === "40A");
    const rows = specRows(["bore", "diameter", "durometer"], left, []);
    expect(value(rows, "קדח")).toBe("1/2 in Hex");
    expect(value(rows, "קשיות")).toBe("40A");
    expect(rows.find((r) => r.label === "קוטר")?.summary).toBe(true);
  });

  it("timing belt: a range of teeth, never the whole list", () => {
    const rows = specRows(["teeth", "width"], belts, []);
    expect(value(rows, "שיניים")).toBe("30t – 300t");
    expect(value(rows, "רוחב")).toBe("9mm, 15mm");
    expect(value(rows, "פסיעה")).toBe("HTD 5mm");
  });

  it("EVO: 18 ratios are a count; a chosen one reads like its chip", () => {
    const ratios = ["2 Stage - 04.77:1 Ratio", "2 Stage - 06.00:1 Ratio", "3 Stage - 05.45:1 Ratio 1.14:1", "3 Stage - 45.33:1 Ratio 2:1"];
    const evo = ratios.map((r) => ({ options: { "stagea-ratio": r }, specs: [] }));
    expect(specRows(["stagea-ratio"], evo, [])[0]).toMatchObject({ label: "יחס שלב א׳", value: "4 אפשרויות" });
    expect(specRows(["stagea-ratio"], evo.slice(1, 2), [])[0]).toMatchObject({ value: "6:1", sub: "2 שלבים" });
    // "Ratio: Refer to EVO Shifter Ratio Chart" points at the chart, which the doc links carry.
    expect(description("andymark-evo-shifter.html").specs).toEqual([]);
  });

  it("Kraken: no two rows named מתח, unknown names stay English", () => {
    const rows = specRows([], [{ options: {}, specs: [] }], cleanDescription(readFileSync(join(__dirname, "../../lib/__fixtures__/ctre-kraken-x60.html"), "utf8")).specs);
    expect(labels(rows).filter((l) => l.startsWith("מתח"))).toEqual(["מתח נומינלי"]);
    expect(labels(rows)).toContain("טווח מתח");
    expect(labels(rows)).toContain("פרוטוקולי תקשורת");
    expect(new Set(labels(rows)).size).toBe(rows.length);
  });

  it("merges two of the supplier's specs that share a Hebrew name", () => {
    const rows = specRows([], [], [
      { key: "Voltage", value: "12V" },
      { key: "Volts", value: "24V max" },
    ]);
    expect(rows).toEqual([{ label: "מתח", value: "12V, 24V max", sub: null, summary: false }]);
  });

  it("keeps a cell to about three lines", () => {
    const rows = specRows([], [], [{ key: "Material", value: "Aluminum, ".repeat(30) }]);
    expect(rows[0].value.length).toBeLessThanOrEqual(121);
    expect(rows[0].value.endsWith("…")).toBe(true);
  });
});
