import { HEBREW_SYNONYMS } from "./search-synonyms";

/**
 * One word of a search and what it may match: any of `alternatives` as a
 * substring of the family's search text. Words are ANDed, alternatives ORed.
 */
export type SearchTerm = { word: string; alternatives: string[] };

const MAX_TERMS = 8;
const HEBREW = /[֐-׿]/;
/** Hebrew one-letter prefixes (ה, ו, ל, ב, מ, ש, כ) that stick to a word. */
const PREFIX = /^[הולבמשכ]/;
/** Longest phrase in the synonym map, in words. */
const MAX_PHRASE = Math.max(...Object.keys(HEBREW_SYNONYMS).map((k) => k.split(" ").length));

/** Letters and digits only, lowercase: "WCP-0749", "wcp 0749" and "wcp0749" all become "wcp0749". */
export function normalizeSku(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "wcp-0749", "am3430", "12-666675", "WCP 0749": letters and digits that read as a part number. */
export function looksLikeSku(input: string): boolean {
  const norm = normalizeSku(input);
  if (norm.length < 4 || norm.length > 24 || HEBREW.test(input)) return false;
  if (!/\d/.test(norm)) return false;
  // At most two words ("wcp 0749"), and not a name with a size ("falcon 500" is a name, "am 3430" a SKU).
  const words = input.trim().split(/\s+/);
  if (words.length > 2) return false;
  return words.length === 1 ? /^[a-z]*[-_.]?\d/i.test(words[0]) || /^\d/.test(words[0]) : /^[a-z]{2,4}$/i.test(words[0]) && /^\d[\d-]*[a-z]?$/i.test(words[1]);
}

/** English plural to singular for words of 4+ letters: "bearings" → "bearing", "boxes" → "box". */
export function singular(word: string): string {
  if (word.length < 4 || HEBREW.test(word) || /\d/.test(word)) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(x|ch|sh|ss)es$/.test(word)) return word.slice(0, -2);
  if (/ies$/.test(word) && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** The synonym-map key a Hebrew word or phrase stands for, after prefixes and plurals, if any. */
function hebrewKey(phrase: string): string | null {
  const tries = new Set<string>();
  const add = (p: string) => {
    tries.add(p);
    tries.add(p.replace(/(ים|ות)$/, ""));
    tries.add(p.replace(/(ים|ות)$/, "ה"));
    tries.add(p.replace(/ות$/, "ת"));
  };
  add(phrase);
  let p = phrase;
  for (let i = 0; i < 2 && PREFIX.test(p) && p.length > 3; i++) {
    p = p.slice(1);
    add(p);
  }
  for (const t of tries) if (HEBREW_SYNONYMS[t]) return t;
  return null;
}

/**
 * Splits a search into terms for the catalog query. English words also match
 * their singular, Hebrew words and phrases match their English synonyms, and a
 * Hebrew word nobody knows is dropped rather than matching nothing.
 */
export function searchTerms(q: string): SearchTerm[] {
  const words = q.toLowerCase().replace(/["״׳']/g, (c) => (c === "״" || c === '"' ? "" : c)).split(/\s+/).filter(Boolean);
  const terms: SearchTerm[] = [];
  for (let i = 0; i < words.length && terms.length < MAX_TERMS; ) {
    const word = words[i];
    if (HEBREW.test(word)) {
      let matched = false;
      for (let n = Math.min(MAX_PHRASE, words.length - i); n >= 1; n--) {
        const phrase = words.slice(i, i + n).join(" ");
        const key = hebrewKey(phrase);
        if (key) {
          terms.push({ word: phrase, alternatives: HEBREW_SYNONYMS[key] });
          i += n;
          matched = true;
          break;
        }
      }
      if (!matched) i++;
      continue;
    }
    const one = singular(word);
    terms.push({ word, alternatives: [...new Set([one, word])].filter((w) => w === one || !w.includes(one)) });
    i++;
  }
  return terms;
}

/** ILIKE patterns for a term, with wildcards in the input taken literally. */
export function likePatterns(term: SearchTerm): string[] {
  return term.alternatives.map((a) => `%${a.replace(/[\%_]/g, "\$&")}%`);
}

/** The English text a search stands for, for title similarity and the trigram fallback. */
export function englishQuery(q: string): string {
  return searchTerms(q)
    .map((t) => t.alternatives[0])
    .join(" ");
}

/** Edits between two words, a swap of neighbours counting as one ("beraing" → "bearing" is 1). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * The search with misspelt English words replaced by the closest catalog word
 * ("krakn x60" → "kraken x60"), or null when nothing needed fixing. `vocabulary`
 * is every title word with how many families use it; ties go to the commoner word.
 */
export function correctQuery(q: string, vocabulary: Map<string, number>): string | null {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let changed = false;
  const fixed = words.map((word) => {
    if (word.length < 4 || HEBREW.test(word) || /\d/.test(word) || vocabulary.has(word) || vocabulary.has(singular(word))) return word;
    const limit = word.length >= 7 ? 2 : 1;
    let best: { word: string; distance: number; count: number } | null = null;
    for (const [candidate, count] of vocabulary) {
      if (Math.abs(candidate.length - word.length) > limit) continue;
      const distance = editDistance(word, candidate);
      if (distance > limit) continue;
      if (!best || distance < best.distance || (distance === best.distance && count > best.count)) best = { word: candidate, distance, count };
    }
    if (!best) return word;
    changed = true;
    return best.word;
  });
  return changed ? fixed.join(" ") : null;
}
