/** Limits for a "send us a link" request. */
export const PART_REQUEST_LIMITS = { url: 2000, note: 1000, query: 100 } as const;

export type PartRequestInput = { url: string; note: string; query: string };
export type PartRequest = { url: string; note: string | null; query: string | null };

/**
 * Checks and tidies a part request: the link may be pasted without "https://"
 * ("wcproducts.com/products/x"), but it must be a web address with a dot in the host.
 * Returns an error in Hebrew for the form, or the request to store.
 */
export function parsePartRequest(input: PartRequestInput): { ok: true; value: PartRequest } | { ok: false; error: string } {
  const raw = input.url.trim();
  if (!raw) return { ok: false, error: "הדביקו קישור לחלק." };
  if (raw.length > PART_REQUEST_LIMITS.url) return { ok: false, error: "הקישור ארוך מדי." };
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "זה לא נראה כמו קישור. העתיקו אותו משורת הכתובת." };
  }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) {
    return { ok: false, error: "זה לא נראה כמו קישור. העתיקו אותו משורת הכתובת." };
  }
  const note = input.note.trim().slice(0, PART_REQUEST_LIMITS.note);
  const query = input.query.trim().slice(0, PART_REQUEST_LIMITS.query);
  return { ok: true, value: { url: url.toString(), note: note || null, query: query || null } };
}
