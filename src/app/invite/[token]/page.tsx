import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/form";
import { ROLE_LABELS } from "@/domain/teams";
import { getViewer } from "@/lib/auth";
import { findInvitation } from "@/lib/invitations";
import { joinInvited, signupInvited } from "../actions";

export const metadata: Metadata = { title: "הזמנה לקבוצה | פורטל רכש FIRST", robots: { index: false } };

async function Invite({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const viewer = await getViewer();
  const found = await findInvitation(token);

  if (!found) {
    return (
      <p>
        הקישור לא בתוקף: ייתכן שכבר נעשה בו שימוש, שפג תוקפו או שבוטל. אם הצטרפתם,{" "}
        <Link href="/team" className="text-brand hover:underline">
          עברו לדף הקבוצה
        </Link>
        . אחרת בקשו ממנהל הקבוצה קישור חדש.
      </p>
    );
  }

  const { invitation, team } = found;
  const intro = (
    <p>
      הוזמנתם להצטרף ל{team.name} (<span className="ltr">{`${team.program} ${team.number}`}</span>) בהרשאת{" "}
      {ROLE_LABELS[invitation.role]}, עם הכתובת <span className="ltr">{invitation.email}</span>.
    </p>
  );

  if (viewer) {
    if (viewer.email.toLowerCase() !== invitation.email) {
      return (
        <div className="flex flex-col gap-3">
          {intro}
          <p className="text-sm text-muted">
            אתם מחוברים עם <span className="ltr">{viewer.email}</span>. כדי להצטרף צאו מהחשבון והתחברו עם הכתובת שהוזמנה.
          </p>
        </div>
      );
    }
    return (
      <ActionForm action={joinInvited} className="flex flex-col gap-3">
        {intro}
        <input type="hidden" name="token" value={token} />
        <Button>הצטרפות לקבוצה</Button>
      </ActionForm>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {intro}
      <p className="text-sm">
        כבר יש לכם חשבון?{" "}
        <Link href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} className="text-brand hover:underline">
          התחברו
        </Link>{" "}
        ותצטרפו אוטומטית.
      </p>
      <ActionForm action={signupInvited} className="flex flex-col gap-3 border-t border-line pt-4">
        <h2 className="font-semibold">פתיחת חשבון</h2>
        <input type="hidden" name="token" value={token} />
        <Field label="שם מלא" name="fullName">
          <Input name="fullName" required />
        </Field>
        <Field label="טלפון" name="phone">
          <Input name="phone" dir="ltr" required />
        </Field>
        <Field label="סיסמה" name="password" hint="לפחות 8 תווים">
          <Input name="password" type="password" dir="ltr" autoComplete="new-password" required minLength={8} />
        </Field>
        <Button>פתיחת חשבון</Button>
      </ActionForm>
    </div>
  );
}

export default function InvitePage(props: PageProps<"/invite/[token]">) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-line bg-surface p-6">
      <h1 className="mb-3 text-xl font-bold">הזמנה לקבוצה</h1>
      <Suspense fallback={<p className="text-muted">טוען…</p>}>
        <Invite {...props} />
      </Suspense>
    </div>
  );
}
