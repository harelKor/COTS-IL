import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { acceptInvitationsForUser } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/validation";

/** Target of the email-verification link. Signs the user in, then continues. */
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
    return NextResponse.redirect(new URL("/login?error=confirm", origin));
  }

  // The address is proven now, so any team that invited it can take the user in.
  const { data } = await supabase.auth.getUser();
  if (data.user?.email) await acceptInvitationsForUser(data.user.id, data.user.email);

  return NextResponse.redirect(new URL(next, origin));
}
