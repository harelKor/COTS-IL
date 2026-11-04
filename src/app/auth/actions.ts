"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { acceptInvitationsForUser } from "@/lib/invitations";
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

  redirect(`/signup/check-email?email=${encodeURIComponent(input.email)}`);
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
