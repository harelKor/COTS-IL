import { describe, expect, it } from "vitest";
import { DEFAULT_HOME, DEFAULT_TAGLINE, fillTokens, SHARE_CARD_LINE, shareCardLine, splitLatin, unknownNames, whyCards } from "./site-text";

describe("the home page's default words", () => {
  it("are the text the page had before it became editable", () => {
    expect(DEFAULT_HOME.mottoLine).toBe("ציוד FRC ו-FTC מכל הספקים,");
    expect(DEFAULT_HOME.mottoAccent).toBe("בהזמנה אחת");
    expect(DEFAULT_HOME.whyHeading).toBe("למה דרך COTS-IL ולא ישירות מהספק");
    expect(whyCards(DEFAULT_HOME, { markup: "1.6", vendors: 7 })).toEqual([
      { title: "הזמנה אחת לכל הספקים", text: "סל אחד מכל 7 הספקים, במקום 7 הזמנות נפרדות." },
      { title: "מחיר בשקלים", text: "מחיר הספק לפי השער היציג של בנק ישראל, כפול 1.6. בלי כרטיס אשראי בדולרים." },
      { title: "משלוח מרוכז", text: "אנחנו מאחדים הזמנות למשלוח אחד ומוסרים לקבוצה." },
      { title: "בלי ניירת מכס", text: "היבוא והשחרור עלינו. אתם מקבלים את החלקים." },
    ]);
  });

  it("keeps the single-vendor wording while the first card is untouched", () => {
    expect(whyCards(DEFAULT_HOME, { markup: "1.6", vendors: 1 })[0].text).toBe("סל אחד לכל הציוד, במקום הזמנות נפרדות.");
    const edited = { ...DEFAULT_HOME, why: [{ title: "x", text: "יש לנו {מספר ספקים} ספקים" }, ...DEFAULT_HOME.why.slice(1)] };
    expect(whyCards(edited, { markup: "1.6", vendors: 1 })[0].text).toBe("יש לנו 1 ספקים");
  });

  it("splits the motto's Latin words from the Hebrew, as the page sets them", () => {
    expect(splitLatin(DEFAULT_HOME.mottoLine)).toEqual(["ציוד ", "FRC", " ו-", "FTC", " מכל הספקים,"]);
  });
});

describe("tokens in the site's own words", () => {
  it("fills known names and blanks the rest", () => {
    expect(fillTokens("כפול {מכפיל}{x}", { מכפיל: "1.7" })).toBe("כפול 1.7");
  });

  it("flags names it doesn't know", () => {
    expect(unknownNames("{מכפיל} {x}", ["מכפיל"])).toEqual(["x"]);
  });
});

describe("the share card's line", () => {
  it("shows the tagline only when its letters can be drawn, else the built-in English line", () => {
    expect(shareCardLine(DEFAULT_TAGLINE)).toBe(SHARE_CARD_LINE);
    expect(shareCardLine("FIRST parts, delivered in Israel")).toBe("FIRST parts, delivered in Israel");
    expect(shareCardLine("חלקים ל-FIRST")).toBe(SHARE_CARD_LINE);
  });
});
