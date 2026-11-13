/**
 * The info pages' text (S16d), edited in /admin/settings/content as simple formatted text:
 *
 *   ## כותרת            a section (on the FAQ page: a question)
 *   text before the first ## is the page's intro
 *   an empty line       a new paragraph
 *   - item              a list item
 *   **bold**, [text](/path)
 *   {מכפיל}             a fact from פרטי העסק or תמחור, inline (INLINE_TOKENS)
 *   {{זמני אספקה}}      a block the site builds from the settings, on a line of its own (BLOCK_TOKENS)
 *
 * A fact that isn't filled in becomes empty; a paragraph left with no letters, and a section
 * left with nothing, are hidden, as the pages did before they were editable.
 */

export const INFO_PAGES = [
  { key: "faq", path: "/faq", title: "שאלות נפוצות" },
  { key: "shipping", path: "/shipping", title: "משלוח וזמני אספקה" },
  { key: "returns", path: "/returns", title: "החזרות" },
  { key: "about", path: "/about", title: "מי אנחנו" },
  { key: "contact", path: "/contact", title: "צור קשר" },
] as const;
export type InfoPageKey = (typeof INFO_PAGES)[number]["key"];

export const INLINE_TOKENS = {
  מכפיל: "המכפיל מתמחור, למשל 1.6",
  כולל: "״, כולל …״ ממה כלול במחיר, או כלום",
  "זמן הצעה": "״ ושולח הצעה תוך N ימי עסקים״, או כלום",
  "דמי טיפול": "דמי הטיפול",
  "תנאי תשלום": "תנאי התשלום",
  "מדיניות החזרות": "מדיניות ההחזרות",
} as const;
export type InlineToken = keyof typeof INLINE_TOKENS;

export const BLOCK_TOKENS = {
  "זמני אספקה": "רשימת זמני האספקה לפי ספק",
  איסוף: "כתובת ושעות איסוף עצמי",
  "פרטי העסק": "שם העסק ומספר ח.פ.",
  "דרכי קשר": "דוא״ל, טלפון, כתובת ווואטסאפ",
} as const;
export type BlockToken = keyof typeof BLOCK_TOKENS;

export type Inline = { t: "text"; v: string } | { t: "bold"; v: string } | { t: "link"; v: string; href: string } | { t: "fact"; name: string; v: string };
export type Block = { t: "p"; inline: Inline[] } | { t: "list"; items: Inline[][] } | { t: "auto"; name: string };
export type Section = { title: string; blocks: Block[] };
export type InfoDoc = { intro: Block[]; sections: Section[] };

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]*)\)|\{([^{}]+)\}/g;

export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    if (m.index > last) out.push({ t: "text", v: line.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "link", v: m[2], href: m[3] });
    else out.push({ t: "fact", name: m[4].trim(), v: "" });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ t: "text", v: line.slice(last) });
  return out;
}

function blocksOf(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ t: "p", inline: parseInline(para.join(" ")) });
    if (list) blocks.push({ t: "list", items: list });
    para = [];
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    const auto = /^\{\{([^{}]+)\}\}$/.exec(line);
    if (!line) flush();
    else if (auto) {
      flush();
      blocks.push({ t: "auto", name: auto[1].trim() });
    } else if (/^[-*] /.test(line)) {
      if (para.length) flush();
      (list ??= []).push(parseInline(line.slice(2).trim()));
    } else {
      if (list) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

export function parseInfoText(text: string): InfoDoc {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const intro: string[] = [];
  const sections: { title: string; lines: string[] }[] = [];
  for (const line of lines) {
    const h = /^##\s+(.+)$/.exec(line.trim());
    if (h) sections.push({ title: h[1].trim(), lines: [] });
    else (sections.at(-1)?.lines ?? intro).push(line);
  }
  return { intro: blocksOf(intro), sections: sections.map((s) => ({ title: s.title, blocks: blocksOf(s.lines) })) };
}

const hasWords = (inline: Inline[]) => /[\p{L}\p{N}]/u.test(inline.map((i) => i.v).join(""));

/**
 * Fills the facts in and drops what's left empty: a paragraph with no letters, a list item
 * with none, a block the page has nothing for (`blocks` lists those it can show), and then a
 * section with no blocks. Unknown facts become empty.
 */
export function resolveInfo(doc: InfoDoc, facts: Partial<Record<string, string>>, blocks: ReadonlySet<string>): InfoDoc {
  const fill = (inline: Inline[]): Inline[] => inline.map((i) => (i.t === "fact" ? { ...i, v: facts[i.name] ?? "" } : i));
  const keep = (list: Block[]): Block[] =>
    list.flatMap((b): Block[] => {
      if (b.t === "auto") return blocks.has(b.name) ? [b] : [];
      if (b.t === "p") {
        const inline = fill(b.inline);
        return hasWords(inline) ? [{ t: "p", inline }] : [];
      }
      const items = b.items.map(fill).filter(hasWords);
      return items.length ? [{ t: "list", items }] : [];
    });
  return {
    intro: keep(doc.intro),
    sections: doc.sections.map((s) => ({ title: s.title, blocks: keep(s.blocks) })).filter((s) => s.blocks.length > 0),
  };
}

/** Names in `text` that aren't a known fact or block, for the editor's warning. */
export function unknownTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{([^{}]+)\}\}|\{([^{}]+)\}/g)) {
    const name = (m[1] ?? m[2]).trim();
    if (m[1] !== undefined ? !(name in BLOCK_TOKENS) : !(name in INLINE_TOKENS)) out.add(name);
  }
  return [...out];
}

/** Today's text of each page, so nothing changes on the site until the admin edits it. */
export const DEFAULT_PAGES: Record<InfoPageKey, string> = {
  faq: `## האם הוספה לסל או שליחת בקשה מחייבות?
לא. הוספה לסל ושליחת בקשה לא מחייבות תשלום. ההזמנה יוצאת לספקים רק אחרי שהקבוצה מאשרת את הצעת המחיר.

## איך נקבע המחיר בשקלים?
המחיר בקטלוג הוא מחיר הספק בדולרים, כפול השער היציג של בנק ישראל (מתעדכן כל יום), כפול {מכפיל}{כולל}. משלוח בתוך ישראל מתומחר בהצעת המחיר, והמחיר המחייב הוא זה שבהצעה שאישרתם.

## למה לא להזמין ישירות מהספק?
כאן יש הזמנה אחת לכל הספקים, מחיר בשקלים לפי השער היציג כפול {מכפיל}, ומשלוח מרוכז, ואנחנו מטפלים ביבוא. לא צריך כרטיס אשראי בדולרים או לעקוב אחרי כמה משלוחים מחו״ל.

## מתי מגיעה הצעת המחיר?
הספק הישראלי בודק כל בקשה ידנית מול המחיר והזמינות העדכניים{זמן הצעה}. ההצעה מופיעה בדף ההזמנה.

## מי בקבוצה יכול להזמין ולאשר?
כל מי שמחובר/ת לחשבון הקבוצה. אין תפקידים: כולם יכולים לבנות את הסל, לשלוח, לאשר, לבטל ולהוסיף או להסיר כתובות דוא״ל של הקבוצה.

## אפשר לבטל?
כן, כל עוד ההצעה עוד לא אושרה, מדף ההזמנה. אחרי האישור ההזמנה יוצאת לספקים.

## מה פירוש ״זמין״ בקטלוג?
הקטלוג מתעדכן מאתרי הספקים כל לילה. ליד כל פריט כתוב אם הוא זמין אצל הספק ומתי זה נבדק, והזמינות נבדקת שוב לפני ההצעה.

## איך משלמים?
{תנאי תשלום}

## כמה זמן לוקח עד שהחלקים מגיעים?
תלוי בספק ובזמינות. הפירוט בעמוד [משלוח וזמני אספקה](/shipping).

## חסר חלק בקטלוג?
כרגע הקטלוג כולל את AndyMark, WCP, CTRE ו-The Thrifty Bot. [כתבו לנו](/contact) ונבדוק.
`,
  shipping: `## מה כלול במחיר
המחיר בקטלוג הוא מחיר הספק בדולרים, כפול השער היציג של בנק ישראל (מתעדכן כל יום), כפול {מכפיל}{כולל}.

משלוח בתוך ישראל מתומחר בנפרד בהצעת המחיר. המחיר המחייב הוא זה שבהצעה שאישרתם.

{דמי טיפול}.

## זמני אספקה
הספירה מתחילה כשהקבוצה מאשרת את ההצעה. אנחנו מזמינים מכל ספק ומאחדים הזמנות של כמה קבוצות למשלוח אחד.

{{זמני אספקה}}

פריט שלא זמין אצל הספק מסומן בהצעה, ואפשר להסיר אותו לפני האישור.

## מסירה
כשהחלקים מגיעים אנחנו בודקים כמויות ופגמים ומוסרים לקבוצה עם תעודת משלוח. דף ההזמנה מראה מה כבר נמסר ומה עוד בדרך.

{{איסוף}}
`,
  returns: `## פריט פגום או חסר
כל משלוח נבדק כשהוא מגיע אלינו: יחידות פגומות לא נמסרות, ומה שחסר נשאר פתוח בהזמנה עד שהוא מגיע.

קיבלתם משהו פגום, חסר או לא נכון? [כתבו לנו](/contact) עם מספר ההזמנה ונטפל.

## מדיניות החזרות
{מדיניות החזרות}
`,
  about: `## COTS-IL
COTS-IL הוא פורטל רכש לקבוצות FIRST בישראל. במקום שכל קבוצה תזמין לבד מכמה אתרים בחו״ל, בדולרים ובכמה משלוחים, בונים כאן סל אחד מ-AndyMark, WCP, CTRE ו-The Thrifty Bot, ואנחנו מזמינים, מרכזים ומוסרים.

הקטלוג מתעדכן מאתרי הספקים כל לילה, כך שהמחירים והזמינות קרובים למה שהספק מציג.

## פרטי העסק
{{פרטי העסק}}
`,
  contact: `שאלה על חלק, על הצעה או על הזמנה? צרפו את מספר ההזמנה אם יש.

## דרכי קשר
{{דרכי קשר}}
`,
};

/** The inline facts' values from פרטי העסק and the multiplier text; an unset fact is "". */
export function inlineFacts(
  business: { priceIncludes: string | null; quoteLeadBusinessDays: number | null; handlingFee: string | null; paymentTerms: string | null; returnPolicy: string | null },
  markup: string,
): Record<InlineToken, string> {
  return {
    מכפיל: markup,
    כולל: business.priceIncludes ? `, כולל ${business.priceIncludes}` : "",
    "זמן הצעה": business.quoteLeadBusinessDays ? ` ושולח הצעה תוך ${business.quoteLeadBusinessDays} ימי עסקים` : "",
    "דמי טיפול": business.handlingFee ?? "",
    "תנאי תשלום": business.paymentTerms ?? "",
    "מדיניות החזרות": business.returnPolicy ?? "",
  };
}
