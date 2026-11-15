/** Phrases suppliers put on pages that hold no real description. */
const PLACEHOLDERS = [/for reference only/i, /this page is for reference/i, /^\s*coming soon\.?\s*$/i, /^\s*n\/?a\s*$/i];

/** Decodes the entities sanitized descriptions carry. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** Plain text of a sanitized description, for meta tags and the placeholder check. */
export function descriptionText(html: string | null): string {
  if (!html) return "";
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** False for empty descriptions and supplier placeholders like "This Page is for Reference Only". */
export function isRealDescription(html: string | null): boolean {
  const text = descriptionText(html);
  if (text.length < 20) return false;
  return !PLACEHOLDERS.some((p) => p.test(text));
}

/** A meta description: the first sentence or so, cut on a word boundary. */
export function metaDescription(text: string, max = 155): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : max).trimEnd()}…`;
}

/**
 * The supplier's own sales talk: US prices, discounts and offers, "contact sales@…",
 * cart and checkout, shipping estimates from the US. We quote in shekels and ship
 * ourselves, so none of it holds for a team ordering here.
 */
const PROMO = [
  /\$\s?\d/,
  /\bUSD\b/,
  /\bMSRP\b/i,
  /\bdiscount/i,
  /\bspecial offer/i,
  /\bpromo(tion|tional)?s?\b/i,
  /\bcoupon/i,
  /\bdeal\b/i,
  /\bsale\b/i,
  /\badd to (your )?cart\b/i,
  /\bcheckout\b/i,
  /\bin (your|the same) cart\b/i,
  /[\w.+-]+@[\w-]+\.[a-z]{2,}/i,
  /\bcontact (us|sales|support|our)\b/i,
  /\bestimated ship/i,
  /\bpre-?orders?\b/i,
  /\bfree shipping\b/i,
];
/** A heading that starts a block of sales talk: everything under it goes. */
const PROMO_HEADING = /special offer|promotion|\bsale\b|\bdeals?\b|pricing|discount/i;
/** A heading over a list or table of specifications, collapsed into the page's spec section. */
const SPEC_HEADING = /spec(ification)?s?|electrical|mechanical|dimensions/i;
/** Links to the supplier's shop pages (not its docs): they send teams to buy there. */
const STORE_LINK = /\/(products|collections|pages|cart)(\/|\?|$)|[?&]_pos=/i;

const VOID = new Set(["br", "img", "hr", "wbr", "source", "col"]);

/** Top-level elements (and stray text) of an HTML fragment, in order. */
function blocks(html: string): string[] {
  const out: string[] = [];
  const re = /<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi;
  let depth = 0;
  let start = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const [, close, name, selfClose] = m;
    if (VOID.has(name.toLowerCase()) || selfClose) continue;
    if (!close) {
      if (depth === 0 && m.index > start) out.push(html.slice(start, m.index));
      if (depth === 0) start = m.index;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) {
        out.push(html.slice(start, re.lastIndex));
        start = re.lastIndex;
      }
    }
  }
  if (start < html.length) out.push(html.slice(start));
  return out.filter((b) => b.trim() !== "");
}

const tagOf = (block: string) => /^<([a-z][a-z0-9]*)/i.exec(block)?.[1].toLowerCase() ?? "";
const inner = (block: string) => block.replace(/^<[^>]+>/, "").replace(/<\/[^>]+>\s*$/, "");
const headingLevel = (tag: string) => (/^h[1-6]$/.test(tag) ? Number(tag[1]) : 0);
const isPromo = (text: string) => PROMO.some((p) => p.test(text));

/** Store links become plain text; a block that was nothing but store links goes. */
function unwrapStoreLinks(block: string): string | null {
  let linkText = "";
  const out = block.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (whole, href: string, text: string) => {
    if (!STORE_LINK.test(decodeEntities(href))) return whole;
    linkText += ` ${text}`;
    return text;
  });
  if (linkText && descriptionText(linkText) === descriptionText(block)) return null;
  return out;
}

export type Spec = { key: string; value: string };

/** "Free Speed: 7500 RPM" → a spec. */
function specLine(text: string): Spec | null {
  const m = /^([^:]{2,40}):\s*(.{1,120})$/.exec(text);
  return m ? { key: m[1].trim(), value: m[2].trim() } : null;
}

/** A spec that only points elsewhere ("Ratio: Refer to EVO Shifter Ratio Chart"): the doc links carry the chart. */
const POINTER = /^(refer to|see|check|please see)\b/i;

/** Names of the tabs a supplier's page shows, which its description keeps as a bulleted list. */
const TAB_LABEL =
  /^(description|overview|details|features|specs|specifications?|tech(nical)? specs|documentation|docs|downloads|resources|cad|faqs?|videos?|reviews?|kit contents|what'?s in the box\??|included|gearbox ratios|ratios?|compatibility|instructions)$/i;

const listItems = (block: string) => blocks(inner(block)).filter((li) => tagOf(li) === "li");
const isList = (block: string) => tagOf(block) === "ul" || tagOf(block) === "ol";
const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The labels of a tab bar ("Description", "Specifications", "Documentation"), or null for a real list. */
function tabLabels(block: string): string[] | null {
  if (!isList(block)) return null;
  const labels = listItems(block).map((li) => descriptionText(li));
  if (labels.length < 2 || labels.some((l) => !l || l.length > 30 || /[.:,;]/.test(l))) return null;
  return labels.filter((l) => TAB_LABEL.test(l)).length * 2 >= labels.length ? labels : null;
}

/** Where one tab's text ends and the next starts: loose text on either side stays apart. */
const BREAK = "\u0000";

/**
 * AndyMark's descriptions hold its page's tabs: a list of the tab names, then a list whose
 * items are the tabs' contents. The names go; each tab's content becomes plain blocks under
 * its name as a heading (none for the description itself), so its spec list is found as one.
 */
function expandTabs(list: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const labels = tabLabels(list[i]);
    if (!labels) {
      out.push(list[i]);
      continue;
    }
    const next = list[i + 1];
    const panels = next && isList(next) ? listItems(next) : [];
    out.push(BREAK);
    if (panels.length === 0 || panels.length > labels.length) continue;
    panels.forEach((panel, j) => {
      out.push(BREAK);
      if (j > 0 || !/^(description|overview)$/i.test(labels[j])) out.push(`<h3>${escapeText(labels[j])}</h3>`);
      out.push(...blocks(inner(panel)));
    });
    i++;
  }
  return out;
}

const INLINE = new Set(["", "br", "wbr", "a", "b", "strong", "em", "i", "u", "span", "sup", "sub", "small", "code", "bdi", "mark"]);

/**
 * Loose text and the inline tags around it become one paragraph, so a link inside a
 * sentence ("…found in <a>Nub Bore</a> Stealth Wheels…") is read with its sentence, not as
 * a block of its own that the store-link rule would drop with its words.
 */
function paragraphs(list: string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > 0 && descriptionText(run.join("")) !== "") out.push(`<p>${run.join("").trim()}</p>`);
    run = [];
  };
  for (const block of list) {
    if (block === BREAK) flush();
    else if (INLINE.has(tagOf(block))) run.push(block);
    else {
      flush();
      out.push(block);
    }
  }
  flush();
  return out;
}

/** A two-column table of name and value, without its "Parameter | Details" header row. */
function tableSpecs(table: string): Spec[] | null {
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
    [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => descriptionText(c[1])),
  );
  if (rows.length === 0 || rows.some((r) => r.length !== 2)) return null;
  const specs = rows
    .filter((r, i) => !(i === 0 && /^(parameter|spec(ification)?|property|feature|name|item)s?$/i.test(r[0])))
    .filter((r) => r[0] && r[1])
    .map(([key, value]) => ({ key, value }));
  return specs.length > 0 ? specs : null;
}

export type CleanDescription = {
  /** The first part, always shown. Empty when nothing real is left. */
  lead: string;
  /** The rest of a long description, behind "קראו עוד". */
  more: string;
  /** Spec tables and "Name: value" spec lists taken out of the text, for the spec section. */
  specs: Spec[];
};

/** About how much text shows before "קראו עוד". */
const LEAD_CHARS = 600;

/**
 * Our version of the supplier's description (sanitized at sync): no sales talk, no
 * links into the supplier's shop, spec tables moved to the spec section, and a long
 * text split into a lead and the rest.
 */
export function cleanDescription(html: string | null): CleanDescription {
  const specs: Spec[] = [];
  if (!html) return { lead: "", more: "", specs };

  const kept: string[] = [];
  let skipBelow = 0; // inside a promo section: skip until a heading at this level or higher
  let heading = "";
  for (const raw of paragraphs(expandTabs(blocks(html)))) {
    const tag = tagOf(raw);
    const level = headingLevel(tag);
    const text = descriptionText(raw);
    if (level) {
      if (skipBelow && level <= skipBelow) skipBelow = 0;
      if (skipBelow) continue;
      if (PROMO_HEADING.test(text) || isPromo(text)) {
        skipBelow = level;
        continue;
      }
      heading = text;
      kept.push(raw);
      continue;
    }
    if (skipBelow) continue;

    if (tag === "table") {
      const found = tableSpecs(raw);
      if (found) {
        specs.push(...found);
        continue;
      }
    }

    if (tag === "ul" || tag === "ol") {
      // Empty items (an empty tab) and sales talk go.
      const items = listItems(raw).filter((li) => (descriptionText(li) !== "" || /<img\b/i.test(li)) && !isPromo(descriptionText(li)));
      const lines = items.map((li) => specLine(descriptionText(li)));
      // A spec list ("Free Speed: 7500 RPM", …) moves to specs; its odd free-text lines stay.
      const asSpecs = SPEC_HEADING.test(heading) && items.length > 0 && lines.filter(Boolean).length >= items.length * 0.8;
      if (asSpecs) specs.push(...lines.filter((l): l is Spec => l !== null && !POINTER.test(l.value)));
      const list = items
        .filter((_, i) => !asSpecs || !lines[i])
        .map(unwrapStoreLinks)
        .filter((li): li is string => li !== null);
      if (list.length === 0) continue;
      kept.push(`<${tag}>${list.join("")}</${tag}>`);
      continue;
    }

    if (!text) continue;
    let block: string | null = raw;
    if (isPromo(text)) {
      // A paragraph of several lines loses only its sales lines ("…please contact us at support@…").
      const lines = inner(raw).split(/<br\s*\/?>/i);
      const clean = lines.filter((l) => descriptionText(l) !== "" && !isPromo(descriptionText(l)));
      if (tag !== "p" || lines.length < 2 || clean.length === 0) continue;
      block = `<p>${clean.map((l) => l.trim()).join("<br />")}</p>`;
    }
    block = unwrapStoreLinks(block);
    if (block !== null) kept.push(block);
  }

  // Headings left with nothing under them (their table moved to specs, their offer removed).
  const body = kept.filter((b, i) => {
    const level = headingLevel(tagOf(b));
    if (!level) return true;
    const next = kept.slice(i + 1).find((x) => !headingLevel(tagOf(x)) || headingLevel(tagOf(x)) <= level);
    return next !== undefined && !headingLevel(tagOf(next));
  });

  if (!isRealDescription(body.join(""))) return { lead: "", more: "", specs };

  let chars = 0;
  let cut = body.length;
  for (let i = 0; i < body.length; i++) {
    chars += descriptionText(body[i]).length;
    if (chars >= LEAD_CHARS) {
      cut = i + 1;
      break;
    }
  }
  // Don't hide a short tail, and don't end the lead on a heading.
  const rest = body.slice(cut);
  if (descriptionText(rest.join("")).length < 200) cut = body.length;
  while (cut > 1 && cut < body.length && headingLevel(tagOf(body[cut - 1]))) cut--;
  return { lead: body.slice(0, cut).join("\n"), more: body.slice(cut).join("\n"), specs };
}
