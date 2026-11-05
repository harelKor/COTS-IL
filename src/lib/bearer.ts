import { createHash, timingSafeEqual } from "node:crypto";

/**
 * True when an Authorization header carries `Bearer <secret>`. Compares hashes in
 * constant time, so the secret can't be guessed from response timing. A missing
 * or short secret never matches, so an unset env var can't open the door.
 */
export function hasBearer(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header?.startsWith("Bearer ")) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header.slice("Bearer ".length)), digest(secret));
}
