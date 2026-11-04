import { describe, expect, it } from "vitest";
import { safeNext, signupSchema } from "./validation";

const valid = {
  program: "FRC",
  teamNumber: "1690",
  teamName: "Orbit",
  fullName: "Dana Levi",
  phone: "050-1234567",
  email: "  Dana@Example.com ",
  password: "longenough",
};

describe("signupSchema", () => {
  it("accepts a valid form and normalizes values", () => {
    const parsed = signupSchema.parse(valid);
    expect(parsed.teamNumber).toBe(1690);
    expect(parsed.email).toBe("dana@example.com");
    expect(parsed.address).toBe("");
  });

  it("rejects an unknown program", () => {
    expect(signupSchema.safeParse({ ...valid, program: "VEX" }).success).toBe(false);
  });

  it("rejects non-integer and out-of-range team numbers", () => {
    for (const teamNumber of ["abc", "0", "12.5", "100000"]) {
      expect(signupSchema.safeParse({ ...valid, teamNumber }).success).toBe(false);
    }
  });

  it("rejects short passwords", () => {
    expect(signupSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
  });
});

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
