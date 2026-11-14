import { describe, expect, it } from "vitest";
import { prefixPhrase, rankSearch, searchRankKey, trigramSimilarity, type SearchRankable } from "./search-rank";

const fam = (title: string, f: Partial<SearchRankable> = {}): SearchRankable => ({
  title,
  categorySlug: "motors",
  available: true,
  minPriceUsd: 30,
  variantCount: 1,
  ...f,
});

const titles = (rows: SearchRankable[]) => rows.map((r) => r.title);

describe("trigramSimilarity", () => {
  it("gives Postgres pg_trgm's similarity()", () => {
    // Values from `SELECT extensions.similarity(a, b)` on the catalog database.
    expect(trigramSimilarity("Kraken X60 Powered by TalonFX", "kraken")).toBeCloseTo(0.233333, 5);
    expect(trigramSimilarity("Kraken Spline Bore Aluminum HTD Pulleys", "kraken")).toBeCloseTo(0.175, 5);
    expect(trigramSimilarity("Flanged Bearing", "bearing")).toBeCloseTo(0.5, 5);
    expect(trigramSimilarity("Bearing Retention and Mount Plates", "bearing")).toBeCloseTo(0.228571, 5);
    expect(trigramSimilarity('1/2" Hex-Bore (12t)', "hex bore")).toBeCloseTo(0.5625, 5);
  });
});

describe("rankSearch", () => {
  it('puts a Kraken motor above "Kraken Spline Bore Pulleys", and out-of-stock modules last', () => {
    const rows = [
      fam("Thrifty Swerve Kraken Bore Pinion Drive Gear Kit", { categorySlug: "gears", minPriceUsd: 34.99 }),
      fam("SDS MK4i Swerve Modules - Motor Pinion Type:Kraken, Gear Ratio:L3 6.12:1", { categorySlug: "drivetrain", available: false, minPriceUsd: 351 }),
      fam("Kraken Spline Bore Aluminum HTD Pulleys", { categorySlug: "belts-chain", minPriceUsd: 12.99, variantCount: 8 }),
      fam('1/2" L Aluminum Motor Spacer (Kraken X44)', { minPriceUsd: 14.99 }),
      fam("Kraken X60 Powered by TalonFX", { minPriceUsd: 217.99, variantCount: 2 }),
      fam("Kraken X60 Screw & Terminal Cover Kit", { minPriceUsd: 6.29 }),
      fam("Kraken X44 Sticker", { minPriceUsd: 0.99 }),
    ];
    const ranked = titles(rankSearch(rows, "kraken"));
    expect(ranked[0]).toBe("Kraken X60 Powered by TalonFX");
    expect(ranked[1]).toBe("Kraken Spline Bore Aluminum HTD Pulleys");
    expect(ranked.at(-1)).toMatch(/^SDS/);
  });

  it('lists the available NEO motors first and the ~25 unavailable swerve modules last for "neo motor"', () => {
    const sds = Array.from({ length: 25 }, (_, i) =>
      fam(`SDS MK4 Swerve Modules - Motor Pinion Type:NEO 8mm Key, Gear Ratio:L${i}`, { categorySlug: "drivetrain", available: false, minPriceUsd: 350 }),
    );
    const rows = [
      ...sds,
      fam("REV NEO Brushless Motor V1.1", { available: false }),
      fam("Sport Gearbox Motor Blocks", { categorySlug: "gearboxes", minPriceUsd: 16 }),
      fam("NEO 550 Brushless Motor"),
      fam("NEO Vortex Brushless Motor"),
      fam("NEO 2.0 Brushless Motor"),
    ];
    const ranked = titles(rankSearch(rows, "neo motor"));
    expect(ranked.slice(0, 3).sort()).toEqual(["NEO 2.0 Brushless Motor", "NEO 550 Brushless Motor", "NEO Vortex Brushless Motor"]);
    // Every part in stock comes before every part that isn't.
    const firstUnavailable = ranked.findIndex((t) => t.startsWith("SDS") || t.endsWith("V1.1"));
    expect(firstUnavailable).toBe(4);
  });

  it("ranks an exact SKU, then the exact title, then a title that starts with a two-word search", () => {
    const rows = [fam("WCP Falcon 500 Gearbox"), fam("Falcon 500 Shaft Coupler"), fam("Falcon 500"), fam("Kit", { skuMatch: true })];
    expect(titles(rankSearch(rows, "falcon 500"))).toEqual(["Kit", "Falcon 500", "Falcon 500 Shaft Coupler", "WCP Falcon 500 Gearbox"]);
  });

  it("doesn't let a one-word search lift every title that starts with it", () => {
    expect(prefixPhrase("bearing")).toBeNull();
    expect(prefixPhrase("kraken x60")).toBe("kraken x60");
    const rows = [fam("Bearing Retention and Mount Plates", { categorySlug: "bearings", variantCount: 4 }), fam("Flanged Bearing", { categorySlug: "bearings", variantCount: 12 })];
    expect(titles(rankSearch(rows, "bearing"))[0]).toBe("Flanged Bearing");
  });

  it("puts the part ahead of its screws and covers, and a real category ahead of other", () => {
    const rows = [fam("Kraken Wire Bundle", { categorySlug: "other" }), fam("Kraken X44 Screw & Terminal Cover Kit"), fam("Kraken X44 Powered by TalonFX")];
    expect(titles(rankSearch(rows, "kraken"))).toEqual(["Kraken X44 Powered by TalonFX", "Kraken X44 Screw & Terminal Cover Kit", "Kraken Wire Bundle"]);
  });

  it("matches Hebrew searches through their English synonyms", () => {
    const [, , , , inTitle] = searchRankKey(fam("Ball Bearing 1/2in Hex"), "מיסב");
    expect(inTitle).toBe(0);
  });
});
