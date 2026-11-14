import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A link that lets one team member (one sign-in email) approve one version of one
 * quote without signing in. It names the quote, the member and the quote's content
 * hash, and expires.
 * If the quote changes, its hash changes and the old link stops working.
 */
export type QuoteLinkClaims = { quoteId: string; userId: string; contentHash: string; expiresAt: number };

/** How long an approval link lasts when the business hasn't set `quoteValidDays`. */
export const DEFAULT_QUOTE_LINK_DAYS = 14;

/** The link lasts as long as the quote it opens is valid (פרטי העסק, תוקף הצעה), 14 days when that is empty. */
export function quoteLinkDays(quoteValidDays: number | null | undefined): number {
  return quoteValidDays && quoteValidDays > 0 ? quoteValidDays : DEFAULT_QUOTE_LINK_DAYS;
}

/** When a link made `now` expires, in ms since the epoch. */
export function quoteLinkExpiresAt(quoteValidDays: number | null | undefined, now = Date.now()): number {
  return now + quoteLinkDays(quoteValidDays) * 24 * 60 * 60 * 1000;
}

const b64 = (data: string | Buffer) => Buffer.from(data).toString("base64url");

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createQuoteLinkToken(claims: QuoteLinkClaims, secret: string): string {
  if (secret.length < 16) throw new Error("QUOTE_LINK_SECRET is missing or too short");
  const payload = b64(JSON.stringify([claims.quoteId, claims.userId, claims.contentHash, claims.expiresAt]));
  return `${payload}.${sign(payload, secret)}`;
}

/** The claims of a genuine, unexpired token, or null. */
export function readQuoteLinkToken(token: string, secret: string | undefined, now = Date.now()): QuoteLinkClaims | null {
  const claims = readSignedQuoteLinkToken(token, secret);
  return claims && claims.expiresAt >= now ? claims : null;
}

/** The claims of a genuine token, expired or not: an expired link can still ask for a new one. */
export function readSignedQuoteLinkToken(token: string, secret: string | undefined): QuoteLinkClaims | null {
  if (!secret || secret.length < 16) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const [quoteId, userId, contentHash, expiresAt] = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof quoteId !== "string" || typeof userId !== "string" || typeof contentHash !== "string" || typeof expiresAt !== "number") return null;
    return { quoteId, userId, contentHash, expiresAt };
  } catch {
    return null;
  }
}
