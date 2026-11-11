import { describe, expect, it } from "vitest";
import { safeNext } from "./validation";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/admin")).toBe("/admin");
  });

  it("drops absolute and protocol-relative URLs", () => {
    for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", undefined, 5]) {
      expect(safeNext(next)).toBe("/");
    }
  });
});
