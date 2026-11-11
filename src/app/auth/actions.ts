"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { getViewer } from "@/lib/auth";
import { acceptInvitationsForUser } from "@/lib/invitations";
import { rememberSignupEmail } from "@/lib/signup-email";
import { createClient } from "@/lib/supabase/server";
import { formValues, loginSchema, safeNext, signupSchema, type FormState } from "@/lib/validation";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["password"]);
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  }
  const input = parsed.data;

  const existing = await db.query.teams.findFirst({
    where: and(eq(schema.teams.program, input.program), eq(schema.teams.number, input.teamNumber)),
  });
  if (existing) {
    return {
      error: `קבוצת ${input.program} ${input.teamNumber} כבר רשומה. אם את/ה חבר/ת הקבוצה, בקש/י ממנהל הקבוצה להוסיף אותך.`,
      values,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm`,
      data: {
        program: input.program,
        team_number: input.teamNumber,
        team_name: input.teamName,
        full_name: input.fullName,
        phone: input.phone,
        address: input.address,
      },
    },
  });
  if (error) {
    return { error: "ההרשמה נכשלה. נסו שוב בעוד מספר דקות.", values };
  }

  await rememberSignupEmail(input.email);
  redirect("/signup/check-email");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = formValues(formData, ["password"]);
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors, values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const message =
      error.code === "email_not_confirmed"
        ? "כתובת הדוא״ל עדיין לא אומתה. בדקו את תיבת הדואר שלכם."
        : "דוא״ל או סיסמה שגויים.";
    return { error: message, values };
  }

  if (data.user.email) await acceptInvitationsForUser(data.user.id, data.user.email);

  redirect(safeNext(formData.get("next")));
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const emailSchema = z.string().trim().toLowerCase().email();

export type EmailLinkState = { sent?: string; error?: string };

/**
 * Sign-in without a password: emails a link that signs the user in (creating the
 * account the first time) and returns to `next`. Used by the cart sheet.
 */
export async function sendEmailLink(email: string, next: string): Promise<EmailLinkState> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: "כתובת דוא״ל לא תקינה" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(safeNext(next))}`, shouldCreateUser: true },
  });
  if (error) return { error: error.status === 429 ? "נשלחו כבר כמה קישורים. נסו שוב בעוד כמה דקות." : "לא הצלחנו לשלוח קישור. נסו שוב בעוד רגע." };
  return { sent: parsed.data };
}

/** Sign-in with Google, then back to `next`. Only offered when the provider is enabled in Supabase. */
export async function signInWithGoogle(next: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(safeNext(next))}` },
  });
  if (error || !data.url) redirect(`/login?error=google`);
  redirect(data.url);
}

const teamSetupSchema = z.object({
  program: z.enum(["FRC", "FTC"]),
  number: z.coerce.number().int().min(1).max(999999),
  name: z.string().trim().min(2, "נא למלא את שם הקבוצה").max(100),
});

export type TeamSetupState = { ok?: boolean; error?: string };

/**
 * A user who signed in with an email link or Google and has no team yet: creates
 * the team (pending the Israeli supplier's approval) with their email on its account.
 * A team number that already exists is never joined this way: someone on that team
 * adds the email from the team's account.
 */
export async function setUpTeam(input: { program: string; number: string | number; name: string }): Promise<TeamSetupState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "צריך להתחבר קודם" };
  if (viewer.teams.length > 0) return { ok: true };
  const parsed = teamSetupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "פרטי הקבוצה לא תקינים" };
  const { program, number, name } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const existing = await tx.query.teams.findFirst({ where: and(eq(schema.teams.program, program), eq(schema.teams.number, number)) });
    if (existing) return { error: `קבוצת ${program} ${number} כבר רשומה. בקשו ממי שרשם/ה אותה להוסיף את הכתובת ${viewer.email}.` };
    const [team] = await tx
      .insert(schema.teams)
      .values({ program, number, name, contactName: viewer.fullName, contactEmail: viewer.email })
      .returning({ id: schema.teams.id });
    await tx.insert(schema.memberships).values({ teamId: team.id, userId: viewer.id });
    return { ok: true as const };
  });
  if ("error" in result) return { error: result.error };
  refresh();
  return { ok: true };
}
