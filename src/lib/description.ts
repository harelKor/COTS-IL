/** Phrases suppliers put on pages that hold no real description. */
const PLACEHOLDERS = [/for reference only/i, /this page is for reference/i, /^\s*coming soon\.?\s*$/i, /^\s*n\/?a\s*$/i];

/** Plain text of a sanitized description, for meta tags and the placeholder check. */
export function descriptionText(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
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
