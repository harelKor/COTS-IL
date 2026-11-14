import { describe, expect, it } from "vitest";
import { hasAuthCookie } from "./session-cookie";

describe("hasAuthCookie", () => {
  it("finds the session cookie, whole or in chunks", () => {
    expect(hasAuthCookie("sb-lzpxrlvtcxyoiuwkoaha-auth-token=base64-eyJh")).toBe(true);
    expect(hasAuthCookie("cots-il-team=1; sb-127-auth-token.0=base64-eyJh; sb-127-auth-token.1=abc")).toBe(true);
  });

  it("ignores other cookies and emptied ones", () => {
    expect(hasAuthCookie("")).toBe(false);
    expect(hasAuthCookie("cots-il-team=abc; _vcrcs=1")).toBe(false);
    expect(hasAuthCookie("sb-127-auth-token=; other=1")).toBe(false);
    expect(hasAuthCookie("sb-127-auth-token-code-verifier=xyz")).toBe(false);
    expect(hasAuthCookie("xsb-127-auth-token=1")).toBe(false);
  });
});
