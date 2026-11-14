import { describe, expect, it } from "vitest";
import { safeNext } from "./validation";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/admin")).toBe("/admin");
    expect(safeNext("/catalog?q=a%20b#top")).toBe("/catalog?q=a%20b#top");
    expect(safeNext("/orders/%2F%2Fevil.example")).toBe("/orders/%2F%2Fevil.example");
  });

  it("drops absolute and protocol-relative URLs", () => {
    for (const next of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      undefined,
      null,
      5,
      "",
      "evil.example",
    ]) {
      expect(safeNext(next)).toBe("/");
    }
  });

  it("drops tabs, newlines and backslashes that browsers turn into a second slash", () => {
    for (const next of [
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "/\t\t/evil.example",
      "/\\/evil.example",
      "/a\\b",
      "/\u0000/evil.example",
    ]) {
      expect(safeNext(next)).toBe("/");
    }
  });

  it("stays on our own origin once resolved", () => {
    for (const next of [
      "/\t/evil.example",
      "/\\/evil.example",
      "//evil.example/path",
      "/%09/evil.example",
      "/%2F/evil.example",
    ]) {
      const resolved = new URL(safeNext(next), "https://cots-il.vercel.app");
      expect(resolved.origin).toBe("https://cots-il.vercel.app");
    }
  });
});
