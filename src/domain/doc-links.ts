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
