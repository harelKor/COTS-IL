import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { acceptInvitationsForUser } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/validation";

/**
 * Target of the email link. The Hebrew template links here with token_hash, which
 * works in any browser; a `code` (PKCE) only works in the browser that asked.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  const supabase = await createClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing token") };

  if (error) {
    // Keep where they were going (and the cart it carries), so the code can finish the job.
    const back = new URL("/login", origin);
    back.searchParams.set("error", "confirm");
    back.searchParams.set("next", next);
    return NextResponse.redirect(back);
  }

  // The address is proven now, so any team that invited it can take the user in.
  const { data } = await supabase.auth.getUser();
  if (data.user?.email) await acceptInvitationsForUser(data.user.id, data.user.email);

  return NextResponse.redirect(new URL(next, origin));
}
