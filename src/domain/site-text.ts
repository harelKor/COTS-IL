/**
 * The site's own words that the admin can edit (M6, תוכן האתר): the one-line tagline and the
 * home page's motto, sub-line and "למה BLUEHUB" cards. The defaults are the text the code
 * carried before they became settings, so nothing changes until the admin edits it.
 */

/** One line about the site: the page description, the app manifest, the share card and the email footer. */
export const DEFAULT_TAGLINE = "ציוד FRC ו-FTC מכל הספקים בהזמנה אחת, במחירים בשקלים לפי שער בנק ישראל";

export type WhyCard = { title: string; text: string };

export type HomeText = {
  /** The motto's first line; Latin words in it (FRC) are set left-to-right by the page. */
  mottoLine: string;
  /** The motto's second line, in the accent colour. */
  mottoAccent: string;
  sub: string;
  whyHeading: string;
  /** Always four cards, in order. */
  why: WhyCard[];
};

/** Tokens a "למה" card's text can use: `{מכפיל}` (the multiplier) and `{מספר ספקים}` (active suppliers). */
export const HOME_TOKENS = {
  מכפיל: "המכפיל מתמחור, למשל 1.6",
  "מספר ספקים": "מספר הספקים הפעילים בקטלוג",
} as const;

export const WHY_CARD_COUNT = 4;

export const DEFAULT_HOME: HomeText = {
  mottoLine: "ציוד FRC ו-FTC מכל הספקים,",
  mottoAccent: "בהזמנה אחת",
  sub: "כל החלקים הרשמיים, משלוח מרוכז ומק״טים מדויקים במקום אחד.",
  whyHeading: "למה דרך BLUEHUB ולא ישירות מהספק",
  why: [
    { title: "הזמנה אחת לכל הספקים", text: "סל אחד מכל {מספר ספקים} הספקים, במקום {מספר ספקים} הזמנות נפרדות." },
    { title: "מחיר בשקלים", text: "מחיר הספק לפי השער היציג של בנק ישראל, כפול {מכפיל}. בלי כרטיס אשראי בדולרים." },
    { title: "משלוח מרוכז", text: "אנחנו מאחדים הזמנות למשלוח אחד ומוסרים לקבוצה." },
    { title: "בלי ניירת מכס", text: "היבוא והשחרור עלינו. אתם מקבלים את החלקים." },
  ],
};

/** The first card says this while the catalog has a single supplier (a count of one reads wrong). */
const SINGLE_VENDOR_TEXT = "סל אחד לכל הציוד, במקום הזמנות נפרדות.";

/** `{name}` in `text` replaced from `values`; a name with no value becomes empty. */
export function fillTokens(text: string, values: Record<string, string>): string {
  return text.replace(/\{([^{}]+)\}/g, (_, name: string) => values[name.trim()] ?? "");
}

/** Names in `text` that aren't in `known`, for the editor's warning. */
export function unknownNames(text: string, known: readonly string[]): string[] {
  return [...new Set([...text.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1].trim()).filter((n) => !known.includes(n)))];
}

/** The cards the home page shows, with their tokens filled in. */
export function whyCards(home: HomeText, facts: { markup: string; vendors: number }): WhyCard[] {
  return home.why.map((card, i) => {
    const untouchedFirst = i === 0 && card.text === DEFAULT_HOME.why[0].text;
    const text = untouchedFirst && facts.vendors <= 1 ? SINGLE_VENDOR_TEXT : fillTokens(card.text, { מכפיל: facts.markup, "מספר ספקים": String(facts.vendors) });
    return { title: card.title, text };
  });
}

/** The share card's line: the tagline when it's all Latin script (the card has no Hebrew font), else the built-in English line. */
export const SHARE_CARD_LINE = "FRC / FTC parts from every supplier, in one order";
export function shareCardLine(tagline: string): string {
  return /[^\x20-\u024F\u2000-\u206F]/.test(tagline) || tagline === DEFAULT_TAGLINE ? SHARE_CARD_LINE : tagline;
}

/** Splits text into its Latin runs (odd indexes) and the rest, so the page can set the Latin runs left-to-right. */
export function splitLatin(text: string): string[] {
  return text.split(/([A-Za-z][A-Za-z0-9.\-+/#'"]*)/);
}
