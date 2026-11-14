/**
 * Whether the browser holds a Supabase session: `sb-<project>-auth-token`, or its chunks
 * `.0`, `.1` when the session is long. The cookies aren't httpOnly, so `document.cookie`
 * shows them. An empty value is a cookie on its way out, not a session.
 */
export function hasAuthCookie(cookie: string): boolean {
  return /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=[^;]/.test(cookie);
}
