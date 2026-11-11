import { cookies } from "next/headers";

export const SIGNUP_EMAIL_COOKIE = "signup_email";

/** Keeps the address for the "check your email" page for ten minutes, out of the URL. */
export async function rememberSignupEmail(email: string) {
  (await cookies()).set(SIGNUP_EMAIL_COOKIE, email, { httpOnly: true, sameSite: "lax", path: "/signup", maxAge: 600 });
}
