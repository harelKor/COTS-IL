/**
 * Public catalog answers change once a day, when the sync runs (it then calls
 * /api/revalidate). The CDN keeps them an hour and serves a stale copy for a day
 * while it fetches a new one, so a keystroke rarely reaches the database.
 */
export const PUBLIC_CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

export function cachedJson(body: unknown) {
  return Response.json(body, { headers: { "Cache-Control": PUBLIC_CACHE } });
}
