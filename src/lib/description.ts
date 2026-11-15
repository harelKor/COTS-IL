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
const PROMO_HEADING = /special offer|promotion|\bsale\b|\bdeals?\b|pricing|discount|lead[- ]?times?|shipping/i;
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
  // Also links that only work on the supplier's own site ("/am-5787", "../ftc", "#tab-7") and links with no address.
  const out = block.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs: string, text: string) => {
    const href = decodeEntities(/\bhref="([^"]*)"/i.exec(attrs)?.[1] ?? "");
    if (/^https?:\/\//i.test(href) && !STORE_LINK.test(href)) return whole;
    linkText += ` ${text}`;
    return text;
  });
  if (linkText && descriptionText(linkText) === descriptionText(block)) return null;
  return out;
}

/**
 * Sentences that speak of the supplier's own page or its shipping, which don't hold here (PP4):
 * lead times and build times (we quote our own), "click here", "scroll down", "the table at the
 * bottom of the page", "READ MORE".
 */
const STRAY = [
  /\blead[- ]?times?\b/i,
  /\bbusiness days\b/i,
  /\bbuild time\b/i,
  /\bbuilt to order\b/i,
  /\bships? (with)?in \d/i,
  /\bclick (here|the link|below)\b/i,
  /\bscroll (down|up)\b/i,
  /\b(above|below) this line\b/i,
  /\b(bottom|top) of (the|this) page\b/i,
  /^\s*read more\W*$/i,
];
/** A bold label that opens a paragraph about shipping ("Availability:", "Leadtime:"): the paragraph goes. */
const STRAY_LABEL = /^(availability|lead[- ]?times?|shipping( info(rmation)?)?|ships|build time)\s*:?$/i;
const isStray = (text: string) => STRAY.some((p) => p.test(text));

/** Empty inline tags left after their words went ("<a></a>"), and stray line breaks at the ends. */
function tidy(html: string): string {
  let out = html;
  for (let i = 0; i < 3; i++) out = out.replace(/<(a|strong|b|em|i|span|u|small)\b[^>]*>(\s|&nbsp;)*<\/\1>/gi, "");
  return out
    .replace(/^((\s|&nbsp;)*<br\s*\/?>)+/i, "")
    .replace(/(<br\s*\/?>(\s|&nbsp;)*)+$/i, "")
    .replace(/(<br\s*\/?>\s*){3,}/gi, "<br /><br />");
}

/**
 * The block without its stray sentences (STRAY). Text is cut into sentences at ". ", "! ", "? "
 * and line breaks; a dropped sentence loses its words while its tags stay (and go when left
 * empty), so the HTML stays balanced.
 */
export function dropStraySentences(html: string): string {
  if (!isStray(descriptionText(html))) return html;
  const pieces: { text: string; tag: boolean; n: number }[] = [];
  let n = 0;
  for (const token of html.split(/(<[^>]+>)/)) {
    if (token === "") continue;
    if (token.startsWith("<")) {
      const br = /^<br\b/i.test(token);
      if (br) n++;
      pieces.push({ text: token, tag: true, n });
      if (br) n++;
      continue;
    }
    token.split(/(?<=[.!?])(?=\s)/).forEach((part, i) => {
      if (i > 0) n++;
      pieces.push({ text: part, tag: false, n });
    });
  }
  const drop = new Set<number>();
  for (let i = 0; i <= n; i++) {
    const text = decodeEntities(
      pieces
        .filter((p) => !p.tag && p.n === i)
        .map((p) => p.text)
        .join(""),
    );
    if (isStray(text)) drop.add(i);
  }
  const kept = pieces.map((p) => (p.tag || !drop.has(p.n) ? p.text : "")).join("");
  // A paragraph or list item keeps its own tags; only what's inside it is tidied.
  const m = /^(\s*<(p|li)\b[^>]*>)([\s\S]*)(<\/\2>\s*)$/i.exec(kept);
  return m ? `${m[1]}${tidy(m[3]).trim()}${m[4]}` : tidy(kept).trim();
}

/** The bold label a block opens with: "Availability:" in "<strong>Availability:</strong> As each…". */
function leadLabel(html: string): string | null {
  const m = /^\s*(?:<p\b[^>]*>)?\s*<(strong|b)>([\s\S]{1,60}?)<\/\1>/i.exec(html);
  return m ? descriptionText(m[2]) : null;
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
  // After a "Leadtime:" label on a line of its own, the list of ship times under it goes too.
  let skipList = false;
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

    const afterLabel = skipList;
    skipList = false;
    if ((tag === "ul" || tag === "ol") && afterLabel) continue;

    if (tag === "ul" || tag === "ol") {
      // Empty items (an empty tab) and sales talk go.
      const items = listItems(raw)
        .map(dropStraySentences)
        .filter((li) => (descriptionText(li) !== "" || /<img\b/i.test(li)) && !isPromo(descriptionText(li)));
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
    // "Availability: built to order, allow 3-4 business days…": we quote our own times.
    const label = leadLabel(raw);
    if (label && STRAY_LABEL.test(label.trim())) {
      skipList = text.replace(/[\s:]+$/, "") === label.replace(/[\s:]+$/, "");
      continue;
    }
    let block: string | null = raw;
    if (isPromo(text)) {
      // A paragraph of several lines loses only its sales lines ("…please contact us at support@…").
      const lines = inner(raw).split(/<br\s*\/?>/i);
      const clean = lines.filter((l) => descriptionText(l) !== "" && !isPromo(descriptionText(l)));
      if (tag !== "p" || lines.length < 2 || clean.length === 0) continue;
      block = `<p>${clean.map((l) => l.trim()).join("<br />")}</p>`;
    }
    block = unwrapStoreLinks(block);
    if (block !== null) block = dropStraySentences(block);
    if (block !== null && descriptionText(block) !== "") kept.push(block);
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

/**
 * One piece of the description as the page lays it out (PP4): running text, a heading, an
 * "IMPORTANT:" or "Note:" paragraph as a callout, a list whose items open with a bold phrase
 * as a feature grid, or a plain list.
 */
export type DescBlock =
  | { kind: "text"; html: string }
  | { kind: "heading"; text: string }
  | { kind: "callout"; tone: "important" | "note"; html: string }
  | { kind: "features"; items: { title: string; html: string }[] }
  | { kind: "list"; ordered: boolean; items: string[] };

const CALLOUT = /^(important|warning|caution|attention|note)\b/i;

/** Line breaks moved out of bold tags ("<strong>Usage: <br /></strong>" → "<strong>Usage:</strong><br />"). */
function breaksOutOfBold(html: string): string {
  return html
    .replace(/<(strong|b)>((?:\s|<br\s*\/?>)+)/gi, "$2<$1>")
    .replace(/((?:\s|<br\s*\/?>)+)<\/(strong|b)>/gi, "</$2>$1")
    .replace(/<(strong|b)>\s*<\/\1>/gi, "");
}

/**
 * A paragraph cut at its blank lines, and a bold label on a line of its own
 * ("<strong>Air Cylinder Shifting:</strong><br />The EVO…") made a heading over the rest.
 */
function splitParagraph(p: string): DescBlock[] {
  const out: DescBlock[] = [];
  for (const part of breaksOutOfBold(inner(p)).split(/(?:<br\s*\/?>\s*){2,}/i)) {
    const m =
      /^\s*<(strong|b)>([^<]{2,70}?)<\/\1>\s*:?\s*(?:<br\s*\/?>\s*)+([\s\S]*)$/i.exec(part) ??
      /^\s*<(strong|b)>([^<]{2,100}?)<\/\1>\s*:?\s*$/i.exec(part) ??
      // "Other features:" on a line of its own, before its list.
      /^\s*()([^<]{2,50}:)\s*$/.exec(part);
    const rest = (m ? (m[3] ?? "") : part).replace(/^(\s|<br\s*\/?>)+|(\s|<br\s*\/?>)+$/gi, "");
    if (m) out.push({ kind: "heading", text: decodeEntities(m[2]).trim().replace(/\s*:$/, "") });
    if (descriptionText(rest) !== "") out.push(paragraphBlock(`<p>${rest}</p>`));
  }
  return out;
}

/** A paragraph, or a callout when it opens with "IMPORTANT:" or "Note" (the label itself goes: the callout says it). */
function paragraphBlock(p: string): DescBlock {
  const text = descriptionText(p);
  const m = CALLOUT.exec(text);
  if (!m) return { kind: "text", html: p };
  const tone = m[1].toLowerCase() === "note" ? "note" : "important";
  const body = inner(p).replace(/^(\s*(?:<(?:strong|b)>\s*)?)(important|warning|caution|attention|note)\s*[:!]\s*/i, "$1");
  return { kind: "callout", tone, html: tidy(body).trim() };
}

/** "Ball-Bearing-Based" and the rest, from "<strong>Ball-Bearing-Based</strong><br />Because…"; null for an item without a bold lead. */
function featureItem(li: string): { title: string; html: string } | null {
  const m = /^\s*<(strong|b)>([\s\S]{1,140}?)<\/\1>([\s\S]*)$/i.exec(breaksOutOfBold(inner(li)));
  if (!m || /<(ul|ol|img|table)\b/i.test(li)) return null;
  let title = descriptionText(m[2]);
  let rest = m[3].replace(/^(\s|<br\s*\/?>|[:\-–—.])+/i, "").trim();
  // All of it bold ("Drive motor: WCP/CTRE Kraken X60."): the words before the colon are the title.
  if (descriptionText(rest) === "" && title.includes(":")) {
    const at = title.indexOf(":");
    rest = escapeText(title.slice(at + 1).trim());
    title = title.slice(0, at);
  }
  title = title.replace(/[\s:.\-–—]+$/, "").trim();
  if (title.length < 2 || title.length > 70) return null;
  return { title, html: rest };
}

/**
 * The cleaned description (cleanDescription's lead and more, joined) as the page lays it out:
 * running text merged, headings, callouts, feature grids and lists. The supplier's words are kept
 * as they are; only the shape changes.
 */
export function descriptionBlocks(html: string): DescBlock[] {
  const out: DescBlock[] = [];
  const push = (b: DescBlock) => {
    const last = out.at(-1);
    if (b.kind === "text" && last?.kind === "text") last.html += `\n${b.html}`;
    // A supplier's one list cut into several ("Short Hex…", "AM14U…", "Short Keyed…") reads as one.
    else if (b.kind === "list" && last?.kind === "list" && last.ordered === b.ordered) last.items.push(...b.items);
    else out.push(b);
  };
  for (const block of blocks(html)) {
    const tag = tagOf(block);
    if (headingLevel(tag)) {
      const text = descriptionText(block);
      if (text) push({ kind: "heading", text });
    } else if (tag === "p") {
      splitParagraph(block).forEach(push);
    } else if (tag === "ul" || tag === "ol") {
      const items = listItems(block);
      const features = items.map(featureItem);
      if (items.length >= 2 && features.filter(Boolean).length >= items.length * 0.8) {
        push({ kind: "features", items: features.map((f, i) => f ?? { title: "", html: inner(items[i]).trim() }) });
      } else {
        push({ kind: "list", ordered: tag === "ol", items: items.map((li) => inner(li).trim()) });
      }
    } else if (descriptionText(block) !== "" || /<(img|table)\b/i.test(block)) {
      push({ kind: "text", html: block });
    }
  }
  // A heading with nothing under it (the last thing, or right before another heading) goes.
  return out.filter((b, i) => b.kind !== "heading" || (out[i + 1] !== undefined && out[i + 1].kind !== "heading"));
}
