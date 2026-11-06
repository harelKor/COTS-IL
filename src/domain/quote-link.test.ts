import { describe, expect, it } from "vitest";
import { createQuoteLinkToken, readQuoteLinkToken } from "./quote-link";

const secret = "a-secret-that-is-long-enough";
const claims = { quoteId: "q1", userId: "u1", contentHash: "h1", expiresAt: 2_000 };

describe("quote approval links", () => {
  it("reads back a token it made", () => {
    expect(readQuoteLinkToken(createQuoteLinkToken(claims, secret), secret, 1_000)).toEqual(claims);
  });

  it("rejects an expired token", () => {
    expect(readQuoteLinkToken(createQuoteLinkToken(claims, secret), secret, 3_000)).toBeNull();
  });

  it("rejects a token signed with another secret, or edited", () => {
    const token = createQuoteLinkToken(claims, secret);
    expect(readQuoteLinkToken(token, "another-secret-long-enough", 1_000)).toBeNull();
    const other = createQuoteLinkToken({ ...claims, userId: "u2" }, secret);
    expect(readQuoteLinkToken(`${other.split(".")[0]}.${token.split(".")[1]}`, secret, 1_000)).toBeNull();
    expect(readQuoteLinkToken(`${token}.x`, secret, 1_000)).toBeNull();
    expect(readQuoteLinkToken("garbage", secret, 1_000)).toBeNull();
  });

  it("works only with a configured secret", () => {
    expect(() => createQuoteLinkToken(claims, "")).toThrow();
    expect(readQuoteLinkToken(createQuoteLinkToken(claims, secret), undefined, 1_000)).toBeNull();
  });
});
