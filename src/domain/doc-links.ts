/**
 * Links to a part's documents, found in the supplier's description: each gets a type and a
 * Hebrew label by that type, so the page says what a link opens rather than repeating the
 * supplier's banner text ("Latest Motor Performance Analysis Report is now available!").
 */
export type DocType = "cad" | "guide" | "drawing" | "datasheet" | "chart" | "other";

export type DocLink = {
  href: string;
  type: DocType;
  /** What it opens, in Hebrew. */
  label: string;
  /** The supplier's own link text, for the `title` tooltip. */
  text: string;
  /** The file's name or the docs site's host ("Motor Performance Analysis Report.pdf"), shown under the label. */
  source: string;
};

export const DOC_LABELS: Record<DocType, string> = {
  cad: "קובצי CAD",
  guide: "מדריך למשתמש",
  drawing: "שרטוט",
  datasheet: "גיליון נתונים",
  chart: "טבלת יחסי העברה",
  other: "מסמך",
};

/** The order a list of documents shows in: CAD first, it's what a team opens a part for. */
const ORDER: DocType[] = ["cad", "guide", "drawing", "datasheet", "chart", "other"];

const FILE = /\.(pdf|step|stp|zip|dxf|dwg|stl|x_t|sldprt|sldasm|igs|iges|f3d|3mf)$/i;
const CAD_FILE = /\.(step|stp|zip|stl|x_t|sldprt|sldasm|igs|iges|f3d|3mf)$/i;
/** Hosts and paths that hold documents, not shop pages. */
const DOC_HOST =
  /(^|[.-])(docs?|help|support|wiki|manuals?|files|downloads?|cad)\.|onshape\.com$|grabcad\.com$|readthedocs\.io$|gitbook\.io$|ctre\.download$|^drive\.google\.com$|dropbox\.com$/i;
const DOC_PATH = /\/(docs?|documentation|manuals?|downloads?|datasheets?|files|pdfs?|support|getting-started)(\/|$)/i;

/** The file's name, readable: "Motor%20Performance%20Analysis%20Report.pdf" → "Motor Performance Analysis Report.pdf". */
function fileName(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  try {
    return decodeURIComponent(last.replace(/\+/g, " "));
  } catch {
    return last;
  }
}

/** What a link opens, from its address first and its words second; null when it opens no document. */
export function classifyDoc(href: string, text: string): DocLink | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const name = fileName(url);
  const isFile = FILE.test(url.pathname);
  const isDocSite = DOC_HOST.test(url.hostname) || DOC_PATH.test(url.pathname);
  // Promotional text over a shop page ("Compare with the Kraken X44 motor."): nothing to open.
  if (!isFile && !isDocSite) return null;

  const words = `${text} ${name} ${url.pathname}`.toLowerCase().replace(/[-_+]/g, " ");
  const type: DocType =
    CAD_FILE.test(url.pathname) || /onshape|grabcad/.test(url.hostname) || /\b(cad|stp|3d models?)\b|(?<!by )\bstep\b(?! by)/.test(words)
      ? "cad"
      : /\b(drawings?|dxf|dwg|dimensions?)\b/.test(words)
        ? "drawing"
        : /\bratio\b.*\bchart\b|\bchart\b.*\bratio\b|\bratio (table|choice)/.test(words)
          ? "chart"
          : /\b(data ?sheets?|spec(ification)?s? sheet|performance|analysis report|test report|curves?)\b/.test(words)
            ? "datasheet"
            : /\b(guides?|manuals?|instructions?|user|assembly|install(ation)?|how to|getting started|pg)\b/.test(words) || isDocSite
              ? "guide"
              : "other";
  return { href, type, label: DOC_LABELS[type], text: text.trim() || name || url.hostname, source: isFile ? name : url.hostname };
}

/**
 * Every document link in a description's HTML, once each, CAD first. With the part's
 * title, a guide that doesn't name the part is "מדריך נלווה" (EVO Shifter links REV's NEO
 * pinion guide), not this part's user guide.
 */
export function documentLinks(html: string | null, textOf: (html: string) => string, title?: string): DocLink[] {
  if (!html) return [];
  const links = new Map<string, DocLink>();
  for (const m of html.matchAll(/<a [^>]*href="(https:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1].replace(/&amp;/g, "&");
    if (links.has(href)) continue;
    const doc = classifyDoc(href, textOf(m[2]));
    if (doc && title && doc.type === "guide" && !namesPart(doc, title)) doc.label = "מדריך נלווה";
    if (doc) links.set(href, doc);
  }
  return sortDocs([...links.values()]);
}

export const sortDocs = (docs: DocLink[]) => [...docs].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));

/** Words of a title that name the part ("kraken", "x60"), not its kind or size. */
const nameWords = (title: string) =>
  title
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/^(and|for|the|with|kit|set|pack|wheels?|gears?|motors?|powered|inch|mm)$/.test(w));

/**
 * The CAD and the guide for the short row in the buy box: only ones that are this part's
 * own. A CAD link whose text says it is CAD ("STEP CAD File Available", not "community-driven
 * tool"); a guide that names the part (the Kraken's docs page, not REV's NEO pinion guide
 * linked from the EVO Shifter).
 */
/** Whether a link's words or address name the part ("kraken" in the Kraken's docs page). */
function namesPart(doc: DocLink, title: string): boolean {
  return nameWords(title).some((w) => `${doc.text} ${doc.href}`.toLowerCase().includes(w));
}

export function quickDocs(docs: DocLink[], title: string): { cad: DocLink | null; guide: DocLink | null } {
  const names = (d: DocLink) => namesPart(d, title);
  return {
    cad: docs.find((d) => d.type === "cad" && (CAD_FILE.test(new URL(d.href).pathname) || /\b(cad|step|models?|onshape)\b/i.test(d.text) || names(d))) ?? null,
    guide: docs.find((d) => d.type === "guide" && names(d)) ?? null,
  };
}

/** A document as a tile on the product page (PP4): what it opens, where it lives, and whose it is. */
export type DocTile = DocLink & {
  /** The tile's bold line: the Hebrew label, or the document's own name when two share a label. */
  title: string;
  /** The Hebrew label, when the title is the document's name instead. */
  kind: string | null;
  /** Where it opens: "PDF", "STEP", "Google Drive", "Onshape", or "אתר תיעוד". Never a bare hostname. */
  tag: string;
  /** The vendor whose description linked it (its tile wears that vendor's colour on a two-vendor page). */
  vendor?: string;
};

/** Known homes of documents, by host. */
const SOURCE_HOSTS: [RegExp, string | ((url: URL) => string)][] = [
  [/^drive\.google\.com$/i, "Google Drive"],
  [/^docs\.google\.com$/i, (url) => (/^\/spreadsheets\//.test(url.pathname) ? "Google Sheets" : /^\/presentation\//.test(url.pathname) ? "Google Slides" : "Google Docs")],
  [/(^|\.)onshape\.com$/i, "Onshape"],
  [/(^|\.)grabcad\.com$/i, "GrabCAD"],
  [/(^|\.)gitbook\.(io|com)$/i, "GitBook"],
  [/(^|\.)readthedocs\.io$/i, "Read the Docs"],
  [/(^|\.)dropbox\.com$/i, "Dropbox"],
  [/(^|\.)github\.com$/i, "GitHub"],
];

/** Where a document opens, in a word: its file type, a known docs service, else "אתר תיעוד". */
export function sourceTag(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return "קישור";
  }
  const ext = /\.([a-z0-9_]{2,6})$/i.exec(url.pathname)?.[1];
  if (ext && FILE.test(`.${ext}`)) return ext.toLowerCase() === "stp" ? "STEP" : ext.toUpperCase();
  for (const [host, name] of SOURCE_HOSTS) if (host.test(url.hostname)) return typeof name === "string" ? name : name(url);
  return "אתר תיעוד";
}

/** Words that name no document ("Click here", "Download", "PDF"). */
const GENERIC_NAME = /^(here|click here|download( here| now)?|link|pdf|cad|step( file)?|docs?|documentation|view|open|more|more info|learn more|read more|user guide|user manual|guide|manual|instructions|drawings?|data ?sheet)$/i;

/**
 * A document's own name, when it has a meaningful one: the supplier's link text when it is a
 * name ("Kraken X60 User Guide", not "Click here"), else the file's name without its type
 * ("EVO Shifter Ratio Chart"). Null for codes and IDs ("REV-21-1650-PG", a Drive file id).
 */
export function docName(doc: Pick<DocLink, "href" | "text">): string | null {
  const text = doc.text.replace(/\s+/g, " ").trim();
  const isName = (s: string) => s.length >= 4 && s.length <= 48 && !GENERIC_NAME.test(s) && /[a-z]{3}/i.test(s) && !/^https?:|[!?]$|^(please|access|follow|see|check|get)\b/i.test(s);
  if (isName(text) && !/\.(pdf|step|stp|zip)$/i.test(text)) return text;
  let url: URL;
  try {
    url = new URL(doc.href);
  } catch {
    return null;
  }
  if (!FILE.test(url.pathname)) return null;
  const file = fileName(url).replace(FILE, "").replace(/[_+]+/g, " ").replace(/\s+/g, " ").trim();
  // A name has words of letters: "EVO Shifter Ratio Chart" is one, "REV-21-1650-PG" and "am-3155_v2" aren't.
  const words = file.split(/[\s-]+/).filter((w) => /^[a-z]{3,}$/i.test(w));
  return words.length >= 2 && isName(file) ? file : null;
}

/**
 * The document tiles in the order they come (sortDocs), each with its tag. When two share a label
 * ("מדריך למשתמש" twice), each takes its own name as the title and keeps the label under it;
 * one without a meaningful name is numbered ("מדריך למשתמש 2"). No two tiles share a title.
 */
export function docTiles<T extends DocLink & { vendor?: string }>(docs: T[]): (DocTile & T)[] {
  const byLabel = new Map<string, T[]>();
  for (const d of docs) byLabel.set(d.label, [...(byLabel.get(d.label) ?? []), d]);
  const used = new Set<string>();
  const tiles = docs.map((d) => {
    const group = byLabel.get(d.label)!;
    const base = { ...d, tag: sourceTag(d.href) };
    if (group.length === 1) return { ...base, title: d.label, kind: null };
    const name = docName(d);
    const clash = name !== null && group.some((o) => o !== d && docName(o)?.toLowerCase() === name.toLowerCase());
    if (name && !clash) return { ...base, title: name, kind: d.label };
    return { ...base, title: `${d.label} ${group.indexOf(d) + 1}`, kind: null };
  });
  // Just in case a name repeats another tile's label: number it.
  return tiles.map((t) => {
    let title = t.title;
    for (let n = 2; used.has(title); n++) title = `${t.title} ${n}`;
    used.add(title);
    return { ...t, title };
  });
}
