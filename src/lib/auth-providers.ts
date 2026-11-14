import "server-only";
import { cacheLife, cacheTag } from "next/cache";

/**
 * Whether Google sign-in is switched on in the Supabase project, so the button
 * only shows once it works. Read from Supabase's public auth settings. It almost
 * never changes and the header asks on every page, so it's kept for hours (a
 * settings save expires it with the rest of the `settings` tag).
 */
export async function googleSignInEnabled(): Promise<boolean> {
  "use cache";
  cacheTag("settings");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    cacheLife("hours");
    return false;
  }
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) throw new Error(`auth settings ${res.status}`);
    const body = (await res.json()) as { external?: { google?: boolean } };
    cacheLife("hours");
    return body.external?.google === true;
  } catch {
    // A failed read is kept briefly, so a blip doesn't hide the button for hours.
    cacheLife("minutes");
    return false;
  }
}

/**
 * A team's name from its number, from The Blue Alliance (FRC only), when a
 * TBA_KEY is set. Without one the sheet simply asks for the name.
 */
export async function lookUpTeamName(program: "FRC" | "FTC", number: number): Promise<string | null> {
  "use cache";
  cacheLife("days");
  const key = process.env.TBA_KEY;
  if (!key || program !== "FRC") return null;
  try {
    const res = await fetch(`https://www.thebluealliance.com/api/v3/team/frc${number}/simple`, { headers: { "X-TBA-Auth-Key": key } });
    if (!res.ok) return null;
    const body = (await res.json()) as { nickname?: string };
    return body.nickname?.trim() || null;
  } catch {
    return null;
  }
}
