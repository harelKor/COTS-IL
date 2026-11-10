import { describe, expect, it } from "vitest";
import { correctQuery, editDistance, englishQuery, likePatterns, looksLikeSku, normalizeSku, searchTerms, singular } from "./search-query";

const alts = (q: string) => searchTerms(q).map((t) => t.alternatives);

describe("searchTerms", () => {
  it("maps Hebrew words, plurals and prefixes to the catalog's English", () => {
    expect(alts("מיסב")).toEqual([["bearing"]]);
    expect(alts("מיסבים")).toEqual([["bearing"]]);
    expect(alts("המנוע")).toEqual([["motor"]]);
    expect(alts("מנועים")).toEqual([["motor"]]);
    expect(alts("סוללה")).toEqual([["battery"]]);
    expect(alts("ספרינג")).toEqual([["spring"]]);
    expect(alts("ספרוקט")).toEqual([["sprocket"]]);
    expect(alts("ספארק")).toEqual([["spark"]]);
  });

  it("matches Hebrew phrases before single words", () => {
    expect(alts("גלגל שיניים")).toEqual([["gear"]]);
    expect(alts("ציר משושה")).toEqual([["hex shaft"]]);
    expect(alts("גלגל")).toEqual([["wheel"]]);
  });

  it("mixes Hebrew and English", () => {
    expect(alts("מיסב 1/2")).toEqual([["bearing"], ["1/2"]]);
  });

  it("drops Hebrew words it doesn't know", () => {
    expect(searchTerms("שלום")).toEqual([]);
  });

  it("matches plurals through the singular", () => {
    expect(alts("Bearings")).toEqual([["bearing"]]);
    expect(alts("gearboxes")).toEqual([["gearbox"]]);
    expect(alts("kraken x60")).toEqual([["kraken"], ["x60"]]);
  });

  it("takes wildcards literally", () => {
    expect(likePatterns(searchTerms("100%_a")[0])).toEqual(["%100\%\_a%"]);
  });
});

describe("singular", () => {
  it("leaves short words, numbers and -ss alone", () => {
    expect(singular("gas")).toBe("gas");
    expect(singular("brass")).toBe("brass");
    expect(singular("x60s")).toBe("x60s");
    expect(singular("pulleys")).toBe("pulley");
    expect(singular("batteries")).toBe("battery");
  });
});

describe("SKUs", () => {
  it("normalises any spelling", () => {
    expect(normalizeSku("WCP-0749")).toBe("wcp0749");
    expect(normalizeSku("wcp 0749")).toBe("wcp0749");
    expect(normalizeSku("am-14U4_FHK")).toBe("am14u4fhk");
  });

  it("tells part numbers from names", () => {
    for (const q of ["wcp-0749", "wcp0749", "WCP 0749", "am-3430", "am3430", "12-666675", "TTB-0293"]) expect(looksLikeSku(q)).toBe(true);
    for (const q of ["falcon 500", "kraken x60", "neo", "spark max", "מיסב 10"]) expect(looksLikeSku(q)).toBe(false);
  });
});

describe("typos", () => {
  const vocabulary = new Map([
    ["kraken", 20],
    ["bearing", 300],
    ["hearing", 1],
    ["falcon", 15],
    ["pulley", 80],
  ]);

  it("counts a swap as one edit", () => {
    expect(editDistance("beraing", "bearing")).toBe(1);
    expect(editDistance("krakn", "kraken")).toBe(1);
  });

  it("fixes words the catalog doesn't have", () => {
    expect(correctQuery("krakn x60", vocabulary)).toBe("kraken x60");
    expect(correctQuery("beraing", vocabulary)).toBe("bearing");
    expect(correctQuery("falcn", vocabulary)).toBe("falcon");
  });

  it("leaves known words, plurals, numbers and Hebrew", () => {
    expect(correctQuery("kraken x60", vocabulary)).toBeNull();
    expect(correctQuery("pulleys", vocabulary)).toBeNull();
    expect(correctQuery("מיסב", vocabulary)).toBeNull();
  });
});

describe("englishQuery", () => {
  it("is the first alternative of every word", () => {
    expect(englishQuery("מיסב hex")).toBe("bearing hex");
  });
});
