import { describe, expect, it } from "vitest";
import { hasBearer } from "./bearer";

const secret = "s3cret-that-is-long-enough";

describe("hasBearer", () => {
  it("accepts the right token", () => {
    expect(hasBearer(`Bearer ${secret}`, secret)).toBe(true);
  });

  it("rejects a wrong, missing or malformed token", () => {
    expect(hasBearer(`Bearer ${secret}x`, secret)).toBe(false);
    expect(hasBearer(null, secret)).toBe(false);
    expect(hasBearer(secret, secret)).toBe(false);
    expect(hasBearer("Bearer ", secret)).toBe(false);
  });

  it("never matches when the secret is unset or too short", () => {
    expect(hasBearer("Bearer ", undefined)).toBe(false);
    expect(hasBearer("Bearer ", "")).toBe(false);
    expect(hasBearer("Bearer short", "short")).toBe(false);
  });
});
