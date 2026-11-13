/** Site content (S16d) without zod, so browser code can import it. The schema is in settings.ts. */

/** One-tap search examples on the home page and in the empty search panel, until the admin edits them. */
export const DEFAULT_SEARCH_EXAMPLES = ["Kraken X60", "SDS MK4i", "CANcoder", '1/2" Hex Bearing'];

/** Whether the banner shows on `today` (YYYY-MM-DD, Israel time): on, with text, and not past its last day. */
export function bannerShows(banner: { enabled: boolean; text: string; endsOn: string | null }, today: string): boolean {
  return banner.enabled && banner.text.length > 0 && (!banner.endsOn || today <= banner.endsOn);
}
