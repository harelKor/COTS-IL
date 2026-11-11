"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { isPhone, parseTeamNumber } from "@/domain/teams";
import { getViewer } from "@/lib/auth";
import { notifyJoinRequest, notifyLater, notifyTeamSignedUp } from "@/lib/notify";
import { acceptInvitationsForUser } from "@/lib/invitations";
import { siteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { formValues, loginSchema, safeNext, type FormState } from "@/lib/validation";
import { BOT_ERROR, isBot } from "@/lib/botid";

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

export type EmailCodeState = { sent?: string; error?: string };

/**
 * Sign-in without a password: emails a 6-digit code and a link (creating the
 * account the first time). The code is typed here, so nobody leaves the page;
 * the link, opened in any browser, signs in and returns to `next`, which
 * carries the guest's cart (withPendingCart).
 */
export async function sendEmailCode(email: string, next: string): Promise<EmailCodeState> {
  if (await isBot()) return { error: BOT_ERROR };
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: "כתובת דוא״ל לא תקינה" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(safeNext(next))}`, shouldCreateUser: true },
  });
  if (error) {
    return {
      error: error.status === 429 ? "נשלחו כבר כמה קודים. חכו דקה ונסו שוב." : "לא הצלחנו לשלוח קוד. נסו שוב בעוד רגע.",
    };
  }
  return { sent: parsed.data };
}

/** The 6-digit code from the email: signs in right here, then joins any team that invited the address. */
export async function verifyEmailCode(email: string, code: string): Promise<{ ok?: boolean; error?: string }> {
  const parsedEmail = emailSchema.safeParse(email);
  const token = code.replace(/\D/g, "");
  if (!parsedEmail.success || token.length !== 6) return { error: "הקוד הוא 6 ספרות" };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email: parsedEmail.data, token, type: "email" });
  if (error || !data.user) {
    return {
      error: error?.status === 429 ? "יותר מדי ניסיונות. חכו דקה ונסו שוב." : "הקוד שגוי או שפג תוקפו. בדקו את המייל האחרון או שלחו קוד חדש.",
    };
  }
  if (data.user.email) await acceptInvitationsForUser(data.user.id, data.user.email);
  refresh();
  return { ok: true };
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
  number: z.unknown().transform((v, ctx) => parseTeamNumber(v) ?? (ctx.addIssue({ code: "custom", message: "מספר קבוצה לא תקין" }), z.NEVER)),
  name: z.string().trim().min(2, "נא למלא את שם הקבוצה").max(100),
  contactName: z.string().trim().min(2, "נא למלא שם איש קשר").max(100),
  contactPhone: z.string().trim().refine(isPhone, "מספר טלפון לא תקין"),
});

export type TeamSetupState = { ok?: boolean; error?: string; taken?: boolean };

/**
 * A user who signed in with an email code or Google and has no team yet:
 * creates the team (pending the Israeli supplier's approval) with their email
 * on its account and the contact the first request goes out with. A team number
 * that already exists is never joined this way: requestToJoin asks the team.
 */
export async function setUpTeam(input: { program: string; number: string; name: string; contactName: string; contactPhone: string }): Promise<TeamSetupState> {
  if (await isBot()) return { error: BOT_ERROR };
  const viewer = await getViewer();
  if (!viewer) return { error: "צריך להתחבר קודם" };
  if (viewer.teams.length > 0) return { ok: true };
  const parsed = teamSetupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "פרטי הקבוצה לא תקינים" };
  const { program, number, name, contactName, contactPhone } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const existing = await tx.query.teams.findFirst({ where: and(eq(schema.teams.program, program), eq(schema.teams.number, number)) });
    if (existing) return { error: `קבוצת ${program} ${number} כבר רשומה. אפשר לבקש להצטרף אליה.`, taken: true };
    const [team] = await tx
      .insert(schema.teams)
      .values({ program, number, name, contactName, contactPhone, contactEmail: viewer.email })
      .returning({ id: schema.teams.id });
    await tx.insert(schema.memberships).values({ teamId: team.id, userId: viewer.id });
    await tx.update(schema.profiles).set({ fullName: contactName, phone: contactPhone }).where(eq(schema.profiles.id, viewer.id));
    return { ok: true as const, teamId: team.id };
  });
  if ("error" in result) return result;
  notifyLater(() => notifyTeamSignedUp(result.teamId, viewer.email));
  refresh();
  return { ok: true };
}

/**
 * "בקשת הצטרפות": asks a registered team to add this signed-in address. Anyone
 * on the team adds it with one tap on the team page. Asking twice is one request.
 */
export async function requestToJoin(input: { program: string; number: string }): Promise<{ ok?: boolean; error?: string }> {
  if (await isBot()) return { error: BOT_ERROR };
  const viewer = await getViewer();
  if (!viewer) return { error: "צריך להתחבר קודם" };
  const program = input.program === "FTC" ? "FTC" : "FRC";
  const number = parseTeamNumber(input.number);
  if (!number) return { error: "מספר קבוצה לא תקין" };
  const team = await db.query.teams.findFirst({ where: and(eq(schema.teams.program, program), eq(schema.teams.number, number)) });
  if (!team) return { error: "הקבוצה לא נמצאה" };
  const requestId = await db.transaction(async (tx) => {
    const [request] = await tx
      .insert(schema.teamJoinRequests)
      .values({ teamId: team.id, userId: viewer.id, email: viewer.email.toLowerCase() })
      .onConflictDoUpdate({
        target: [schema.teamJoinRequests.teamId, schema.teamJoinRequests.userId],
        set: { decidedAt: null, decidedBy: null, accepted: null, createdAt: new Date() },
      })
      .returning({ id: schema.teamJoinRequests.id });
    await tx.insert(schema.auditLog).values({ actorId: viewer.id, entity: "team_join_request", entityId: request.id, action: "create", after: { teamId: team.id } });
    return request.id;
  });
  notifyLater(() => notifyJoinRequest(team.id, requestId, { email: viewer.email, name: viewer.fullName }));
  return { ok: true };
}
