import { describe, expect, it } from "vitest";
import {
  adminsCheck,
  emailCheck,
  githubCheck,
  healthAlertEmail,
  healthChecks,
  jobCheck,
  parseTokenExpiration,
  publicStatus,
  rateCheck,
  shouldAlert,
  staleSupplierCodes,
  syncCheck,
  worstLevel,
  type HealthInput,
  type SupplierSync,
} from "./health";

const now = new Date("2026-11-14T08:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000);

const supplier = (over: Partial<SupplierSync> = {}): SupplierSync => ({
  code: "wcp",
  name: "WCP",
  platform: "shopify",
  createdAt: hoursAgo(24 * 60),
  lastSuccessAt: hoursAgo(6),
  lastFullSuccessAt: null,
  latest: { status: "succeeded", startedAt: hoursAgo(6.1), error: null },
  ...over,
});

describe("syncCheck", () => {
  it("is ok after a recent success", () => {
    expect(syncCheck(supplier(), now)).toMatchObject({ key: "sync:wcp", level: "ok", line: "סונכרן לפני 6 שעות" });
  });

  it("is red 36 hours after the last success", () => {
    const c = syncCheck(supplier({ lastSuccessAt: hoursAgo(37), latest: { status: "failed", startedAt: hoursAgo(6), error: "HTTP 503" } }), now);
    expect(c.level).toBe("red");
    expect(c.line).toContain("לא סונכרן בהצלחה מאז");
    expect(c.detail).toBe("HTTP 503");
  });

  it("is yellow when the last run failed but a success is recent", () => {
    const c = syncCheck(supplier({ lastSuccessAt: hoursAgo(30), latest: { status: "failed", startedAt: hoursAgo(6), error: "boom" } }), now);
    expect(c.level).toBe("yellow");
    expect(c.line).toContain("הריצה האחרונה נכשלה");
  });

  it("counts a job running for more than 3 hours as failed", () => {
    const stuck = syncCheck(supplier({ lastSuccessAt: hoursAgo(30), latest: { status: "running", startedAt: hoursAgo(4), error: null } }), now);
    expect(stuck.level).toBe("yellow");
    expect(stuck.line).toContain("נתקעה");
    const running = syncCheck(supplier({ latest: { status: "running", startedAt: hoursAgo(1), error: null } }), now);
    expect(running.level).toBe("ok");
  });

  it("waits for a new supplier's first sync, then turns red", () => {
    expect(syncCheck(supplier({ createdAt: hoursAgo(2), lastSuccessAt: null, latest: null }), now).level).toBe("yellow");
    expect(syncCheck(supplier({ createdAt: hoursAgo(40), lastSuccessAt: null, latest: null }), now).level).toBe("red");
    expect(syncCheck(supplier({ createdAt: hoursAgo(2), lastSuccessAt: null, latest: { status: "failed", startedAt: hoursAgo(1), error: "x" } }), now).level).toBe("red");
  });

  it("warns when a BigCommerce store hasn't been read in full for 8 days", () => {
    const bc = supplier({ platform: "bigcommerce", lastFullSuccessAt: hoursAgo(24 * 9) });
    expect(syncCheck(bc, now).level).toBe("yellow");
    expect(syncCheck({ ...bc, lastFullSuccessAt: hoursAgo(24 * 6) }, now).level).toBe("ok");
  });
});

describe("rateCheck", () => {
  it("is yellow after 5 days and links to the manual override", () => {
    const c = rateCheck({ rateDate: "2026-11-08", manual: false }, now);
    expect(c.level).toBe("yellow");
    expect(c.href).toBe("/admin/settings/pricing#rate");
    expect(rateCheck({ rateDate: "2026-11-12", manual: false }, now).level).toBe("ok");
  });

  it("is ok with a manual rate, red with none at all", () => {
    expect(rateCheck({ rateDate: "2026-10-01", manual: true }, now).level).toBe("ok");
    expect(rateCheck(null, now).level).toBe("red");
  });
});

describe("jobCheck", () => {
  it("is ok after a recent success", () => {
    expect(jobCheck("backup", { lastRun: { ok: true, at: hoursAgo(5) }, lastSuccessAt: hoursAgo(5) }, now).level).toBe("ok");
  });

  it("is red when the last run failed", () => {
    const c = jobCheck("daily_digest", { lastRun: { ok: false, at: hoursAgo(5) }, lastSuccessAt: hoursAgo(29) }, now);
    expect(c.level).toBe("red");
    expect(c.line).toContain("נכשל");
  });

  it("is red when it hasn't run for 36 hours", () => {
    expect(jobCheck("backup", { lastRun: { ok: true, at: hoursAgo(40) }, lastSuccessAt: hoursAgo(40) }, now).level).toBe("red");
  });

  it("is yellow before the first report", () => {
    expect(jobCheck("revalidate", { lastRun: null, lastSuccessAt: null }, now).level).toBe("yellow");
  });

  it("never makes the watchdog red: it's the one that would email", () => {
    expect(jobCheck("watchdog", { lastRun: { ok: false, at: hoursAgo(5) }, lastSuccessAt: null }, now).level).toBe("yellow");
    expect(jobCheck("watchdog", { lastRun: { ok: true, at: hoursAgo(40) }, lastSuccessAt: hoursAgo(40) }, now).level).toBe("ok");
    expect(jobCheck("watchdog", { lastRun: { ok: true, at: hoursAgo(50) }, lastSuccessAt: hoursAgo(50) }, now).level).toBe("yellow");
  });
});

describe("emailCheck", () => {
  it("is ok with no failures, yellow with some, red when the last one failed", () => {
    expect(emailCheck({ on: true, sent7d: 4, failed7d: 0, lastFailed: false }).level).toBe("ok");
    expect(emailCheck({ on: true, sent7d: 4, failed7d: 1, lastFailed: false })).toMatchObject({ level: "yellow", line: expect.stringContaining("מייל אחד נכשל") });
    expect(emailCheck({ on: true, sent7d: 0, failed7d: 3, lastFailed: true }).level).toBe("red");
  });

  it("says email is off", () => {
    expect(emailCheck({ on: false, sent7d: 0, failed7d: 0, lastFailed: false }).level).toBe("yellow");
  });
});

describe("githubCheck", () => {
  const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000);
  it("is ok far from expiry, yellow within 30 days, red once expired", () => {
    expect(githubCheck({ state: "valid", expiresAt: inDays(200) }, now).level).toBe("ok");
    expect(githubCheck({ state: "valid", expiresAt: inDays(20) }, now)).toMatchObject({ level: "yellow", line: expect.stringContaining("בעוד 20 ימים") });
    expect(githubCheck({ state: "valid", expiresAt: inDays(-1) }, now).level).toBe("red");
    expect(githubCheck({ state: "valid", expiresAt: null }, now).level).toBe("ok");
  });

  it("is red when GitHub rejects the key, yellow when missing or unreachable", () => {
    expect(githubCheck({ state: "rejected", status: 401 }, now).level).toBe("red");
    expect(githubCheck({ state: "rejected", status: 404 }, now).line).toContain("הרשאת Actions");
    expect(githubCheck({ state: "missing" }, now).level).toBe("yellow");
    expect(githubCheck({ state: "unreachable" }, now).level).toBe("yellow");
  });
});

describe("adminsCheck", () => {
  it("warns while there is only one admin", () => {
    expect(adminsCheck(1).level).toBe("yellow");
    expect(adminsCheck(2).level).toBe("ok");
    expect(adminsCheck(0).level).toBe("red");
  });
});

const input = (over: Partial<HealthInput> = {}): HealthInput => ({
  now,
  suppliers: [supplier(), supplier({ code: "ctre", name: "CTRE", lastSuccessAt: hoursAgo(50) })],
  rate: { rateDate: "2026-11-13", manual: false },
  jobs: {
    backup: { lastRun: { ok: true, at: hoursAgo(6) }, lastSuccessAt: hoursAgo(6) },
    revalidate: { lastRun: { ok: true, at: hoursAgo(5) }, lastSuccessAt: hoursAgo(5) },
    daily_digest: { lastRun: { ok: true, at: hoursAgo(5) }, lastSuccessAt: hoursAgo(5) },
    watchdog: { lastRun: { ok: true, at: hoursAgo(2) }, lastSuccessAt: hoursAgo(2) },
  },
  emails: { on: true, sent7d: 3, failed7d: 0, lastFailed: false },
  github: { state: "valid", expiresAt: new Date("2027-06-01T00:00:00Z") },
  admins: 1,
  ...over,
});

describe("healthChecks", () => {
  it("lists red first, then yellow, then ok", () => {
    const checks = healthChecks(input());
    expect(checks.map((c) => c.level).slice(0, 2)).toEqual(["red", "yellow"]);
    expect(checks[0].key).toBe("sync:ctre");
    expect(checks[1].key).toBe("admins");
    expect(worstLevel(checks)).toBe("red");
    expect(publicStatus(checks)).toBe("error");
  });

  it("is all ok on a healthy site", () => {
    const checks = healthChecks(input({ suppliers: [supplier()], admins: 2 }));
    expect(worstLevel(checks)).toBe("ok");
    expect(publicStatus(checks)).toBe("ok");
  });
});

describe("staleSupplierCodes", () => {
  it("lists suppliers without a success for 4 days", () => {
    const list = [
      supplier(),
      supplier({ code: "ctre", lastSuccessAt: hoursAgo(24 * 5) }),
      supplier({ code: "new", lastSuccessAt: null, createdAt: hoursAgo(5) }),
      supplier({ code: "never", lastSuccessAt: null, createdAt: hoursAgo(24 * 10) }),
    ];
    expect(staleSupplierCodes(list, now)).toEqual(["ctre", "never"]);
  });
});

describe("parseTokenExpiration", () => {
  it("reads GitHub's header forms", () => {
    expect(parseTokenExpiration("2027-01-31 12:00:00 UTC")?.toISOString()).toBe("2027-01-31T12:00:00.000Z");
    expect(parseTokenExpiration("2027-01-31 12:00:00 +0200")?.toISOString()).toBe("2027-01-31T10:00:00.000Z");
    expect(parseTokenExpiration("2027-01-31 12:00 -07:00")?.toISOString()).toBe("2027-01-31T19:00:00.000Z");
  });

  it("is null without one", () => {
    expect(parseTokenExpiration(null)).toBeNull();
    expect(parseTokenExpiration("soon")).toBeNull();
  });
});

describe("shouldAlert", () => {
  it("emails on a new red, not again for the same one until 3 days pass", () => {
    expect(shouldAlert(null, [], now)).toBe(false);
    expect(shouldAlert(null, ["backup"], now)).toBe(true);
    expect(shouldAlert({ keys: ["backup"], at: hoursAgo(24) }, ["backup"], now)).toBe(false);
    expect(shouldAlert({ keys: ["backup"], at: hoursAgo(24) }, ["backup", "sync:wcp"], now)).toBe(true);
    expect(shouldAlert({ keys: ["backup"], at: hoursAgo(72) }, ["backup"], now)).toBe(true);
  });
});

describe("healthAlertEmail", () => {
  it("lists the red lines with absolute links, escaped", () => {
    const checks = healthChecks(input({ admins: 2, suppliers: [supplier({ code: "x", name: "A<B>", lastSuccessAt: hoursAgo(50) })] }));
    const email = healthAlertEmail(checks, "https://cots-il.vercel.app");
    expect(email.subject).toBe("BLUEHUB: תקלה אחת באתר");
    expect(email.html).toContain("A&#60;B&#62;");
    expect(email.html).toContain("https://cots-il.vercel.app/admin/settings/suppliers");
    expect(email.text).toContain("סנכרון A<B>");
  });
});
