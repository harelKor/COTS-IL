import { describe, expect, it } from "vitest";
import { createQuoteLinkToken, DEFAULT_QUOTE_LINK_DAYS, quoteLinkDays, quoteLinkExpiresAt, readQuoteLinkToken } from "./quote-link";

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

describe("how long an approval link lasts", () => {
  it("follows the quote's validity, and is 14 days while that is empty", () => {
    expect(DEFAULT_QUOTE_LINK_DAYS).toBe(14);
    expect(quoteLinkDays(null)).toBe(14);
    expect(quoteLinkDays(undefined)).toBe(14);
    expect(quoteLinkDays(0)).toBe(14);
    expect(quoteLinkDays(30)).toBe(30);
    expect(quoteLinkDays(7)).toBe(7);
  });

  it("expires that many days after it was made", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(quoteLinkExpiresAt(7, 1_000)).toBe(1_000 + 7 * day);
    expect(quoteLinkExpiresAt(null, 1_000)).toBe(1_000 + 14 * day);
  });
});
