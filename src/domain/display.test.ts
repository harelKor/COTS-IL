import { describe, expect, it } from "vitest";
import { formatAddress, formatDay, missingAddressParts, parseAddress, teamDisplay } from "./display";

describe("teamDisplay", () => {
  it("reads name, program, number", () => {
    expect(teamDisplay({ name: "אורביט ", program: "FRC", number: 1690 })).toBe("אורביט FRC 1690");
  });
});

describe("formatDay", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  it("is day first, without the year this year", () => {
    expect(formatDay(new Date("2026-03-04T10:00:00Z"), now)).toBe("04/03");
  });
  it("adds the year for other years", () => {
    expect(formatDay(new Date("2025-12-31T10:00:00Z"), now)).toBe("31/12/25");
  });
  it("uses Israel time", () => {
    expect(formatDay(new Date("2026-03-04T23:30:00Z"), now)).toBe("05/03");
  });
});

describe("addresses", () => {
  it("round-trips the fields", () => {
    const parts = { street: "שדרות רוטשילד", houseNumber: "12א", city: "תל אביב" };
    expect(formatAddress(parts)).toBe("שדרות רוטשילד 12א, תל אביב");
    expect(parseAddress(formatAddress(parts))).toEqual(parts);
  });
  it("keeps an unrecognised address in the street field", () => {
    expect(parseAddress("בית הספר אורט")).toEqual({ street: "בית הספר אורט", houseNumber: "", city: "" });
  });
  it("needs street, number and city", () => {
    expect(missingAddressParts({ street: "הרצל", houseNumber: "", city: "חיפה" })).toEqual(["houseNumber"]);
    expect(missingAddressParts({ street: "", houseNumber: "3", city: "" })).toEqual(["street", "city"]);
    expect(missingAddressParts({ street: "הרצל", houseNumber: "3/5", city: "חיפה" })).toEqual([]);
  });
});
