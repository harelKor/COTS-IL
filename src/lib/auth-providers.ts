import "server-only";
import { cacheLife } from "next/cache";

/**
 * Whether Google sign-in is switched on in the Supabase project, so the button
 * only shows once it works. Read from Supabase's public auth settings.
 */
export async function googleSignInEnabled(): Promise<boolean> {
  "use cache";
  cacheLife("minutes");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return false;
    const body = (await res.json()) as { external?: { google?: boolean } };
    return body.external?.google === true;
  } catch {
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
