import { describe, expect, it } from "vitest";
import { assessRun, emptyStats, needsAttention, type PageRunStats } from "./sync-health";

const run = (over: Partial<PageRunStats>): PageRunStats => ({ ...emptyStats("full"), sitemapUrls: 100, pages: 100, parsed: 100, ...over });

describe("assessRun", () => {
  it("accepts a normal run", () => {
    expect(assessRun(run({ stubs: 30, parsed: 70 }))).toEqual({ ok: true, warnings: [] });
  });

  it("doesn't count category pages reached through stubs", () => {
    expect(assessRun(run({ pages: 300, stubs: 100, landing: 80, parsed: 120 })).ok).toBe(true);
  });

  it("refuses an empty sitemap", () => {
    expect(assessRun(run({ sitemapUrls: 0, pages: 0, parsed: 0 }))).toMatchObject({ ok: false });
  });

  it("refuses a run where pages no longer yield products (a redesign)", () => {
    const verdict = assessRun(run({ parsed: 12 }));
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.reason).toContain("12 of 100");
  });

  it("refuses when too many pages kept failing, accepts a few", () => {
    expect(assessRun(run({ unread: 5, parsed: 95 })).ok).toBe(false);
    expect(assessRun(run({ unread: 2, parsed: 98 })).ok).toBe(true);
  });

  it("refuses when option lookups or parent pages break", () => {
    expect(assessRun(run({ variantCalls: 100, variantFailures: 40 })).ok).toBe(false);
    expect(assessRun(run({ parents: 10, parentsWithoutChildren: 5 })).ok).toBe(false);
    expect(assessRun(run({ parents: 10, parentsWithoutChildren: 1 })).ok).toBe(true);
  });

  it("warns about missing prices or stock without failing", () => {
    const verdict = assessRun(run({ noPrice: 10, unknownStock: 1 }));
    expect(verdict).toEqual({ ok: true, warnings: ["10% without a price"] });
  });

  it("lets a small refresh through", () => {
    expect(assessRun({ ...emptyStats("refresh"), pages: 3, parsed: 3 }).ok).toBe(true);
  });
});

describe("needsAttention", () => {
  it("flags jobs with many products missing a price or stock", () => {
    expect(needsAttention({ parsed: 100, noPrice: 6 })).toBe(true);
    expect(needsAttention({ parsed: 100, unknownStock: 2 })).toBe(false);
    expect(needsAttention(null)).toBe(false);
  });
});
