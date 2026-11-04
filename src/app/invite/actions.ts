"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { getViewer } from "@/lib/auth";
import { acceptInvitationsForUser, findInvitation } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const signupSchema = z.object({
  token: z.string().min(1),
  fullName: z.string().trim().min(2, "נא למלא שם").max(100),
  phone: z.string().trim().regex(/^[0-9+\-() ]{7,20}$/, "מספר טלפון לא תקין"),
  password: z.string().min(8, "לפחות 8 תווים"),
});

/** Sign-up from an invitation. The email comes from the invitation, never from the form. */
export async function signupInvited(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { token, fullName, phone, password } = parsed.data;

  const found = await findInvitation(token);
  if (!found) return { error: "ההזמנה כבר לא בתוקף" };
  const { email } = found.invitation;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm`, data: { full_name: fullName, phone } },
  });
  if (error) return { error: "ההרשמה נכשלה. נסו שוב בעוד מספר דקות." };
  // Supabase hides existing accounts by returning a user with no identities.
  if (data.user?.identities?.length === 0) return { error: "כבר קיים חשבון לדוא״ל הזה. התחברו כדי להצטרף." };

  redirect(`/signup/check-email?invited=1&email=${encodeURIComponent(email)}`);
}

/** Joins as the signed-in user, whose address has to be the invited one. */
export async function joinInvited(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const found = await findInvitation(String(formData.get("token") ?? ""));
  if (!found) return { error: "ההזמנה כבר לא בתוקף" };
  if (found.invitation.email !== viewer.email.toLowerCase()) return { error: "ההזמנה נשלחה לכתובת דוא״ל אחרת" };

  await acceptInvitationsForUser(viewer.id, viewer.email);
  revalidatePath("/", "layout");
  redirect("/team");
}
