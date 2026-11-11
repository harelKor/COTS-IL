import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { Button } from "@/components/form";
import { SignInStep } from "@/components/cart-panel";
import { googleSignInEnabled } from "@/lib/auth-providers";
import { getViewer } from "@/lib/auth";
import { findInvitation } from "@/lib/invitations";
import { joinInvited } from "../actions";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { TeamName } from "@/components/team-name";

export const metadata: Metadata = { title: "הזמנה לקבוצה", robots: { index: false } };

async function Invite({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const [viewer, found, google] = await Promise.all([getViewer(), findInvitation(token), googleSignInEnabled()]);

  if (!found) {
    return (
      <p>
        הקישור לא בתוקף: ייתכן שכבר נעשה בו שימוש, שפג תוקפו או שבוטל. אם הצטרפתם,{" "}
        <Link href="/team" className="text-brand hover:underline">
          עברו לחשבון הקבוצה
        </Link>
        . אחרת בקשו ממישהו בקבוצה קישור חדש.
      </p>
    );
  }

  const { invitation, team } = found;
  const joined = viewer?.teams.some((t) => t.id === team.id);
  if (invitation.acceptedAt || joined) {
    return (
      <p>
        הצטרפתם ל<TeamName team={team} />.{" "}
        <Link href={joined ? "/team" : `/login?next=${encodeURIComponent("/team")}`} className="text-brand hover:underline">
          {joined ? "לחשבון הקבוצה" : "כניסה לחשבון הקבוצה"}
        </Link>
      </p>
    );
  }
  const intro = (
    <p>
      הוזמנתם להצטרף לחשבון של <TeamName team={team} /> עם הכתובת{" "}
      <span className="ltr">{invitation.email}</span>. אחרי ההצטרפות אפשר להזמין, לשלוח בקשות ולאשר הצעות בשם הקבוצה.
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

  // Signing in with the invited address joins the team right away (acceptInvitationsForUser).
  return (
    <div className="flex flex-col gap-4">
      {intro}
      <SignInStep google={google} next={`/invite/${token}`} email={invitation.email} intro="נשלח קוד כניסה לכתובת שהוזמנה, בלי סיסמה." />
    </div>
  );
}

export default function InvitePage(props: PageProps<"/invite/[token]">) {
  return (
    <div className="mx-auto max-w-md card-surface p-6">
      <h1 className="mb-3 text-xl font-semibold">הזמנה לקבוצה</h1>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <Invite {...props} />
      </Suspense>
    </div>
  );
}
