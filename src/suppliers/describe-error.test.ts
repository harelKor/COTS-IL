import { describe, expect, it } from "vitest";
import { describeError } from "./sync";

describe("describeError", () => {
  it("keeps the outer message and the cause", () => {
    const cause = Object.assign(new Error("getaddrinfo ENOTFOUND store.example"), { code: "ENOTFOUND" });
    expect(describeError(new TypeError("fetch failed", { cause }))).toBe("fetch failed: getaddrinfo ENOTFOUND store.example");
  });

  it("never comes back empty when the cause has no message", () => {
    const cause = Object.assign(new Error(""), { code: "ECONNRESET" });
    expect(describeError(new TypeError("fetch failed", { cause }))).toBe("fetch failed: ECONNRESET");
    const refused = new AggregateError([Object.assign(new Error("connect ECONNREFUSED 1.2.3.4:443"), { code: "ECONNREFUSED" })], "");
    expect(describeError(new TypeError("fetch failed", { cause: refused }))).toBe("fetch failed: connect ECONNREFUSED 1.2.3.4:443");
  });

  it("describes things that aren't errors", () => {
    expect(describeError("boom")).toBe("boom");
  });
});
