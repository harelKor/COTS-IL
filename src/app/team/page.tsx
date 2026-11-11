import { and, asc, eq, gt, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db, schema } from "@/db";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { getViewer, orderingTeam } from "@/lib/auth";
import { decideJoinRequest, removeMember, revokeInvitation, updateTeamDetails } from "./actions";
import { InviteForm } from "./invite-form";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "חשבון הקבוצה" };

const { memberships, profiles, teamInvitations, teamJoinRequests, teams } = schema;

async function Team() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/team");
  const team = orderingTeam(viewer);
  if (!team) redirect(viewer.isAdmin ? "/admin" : "/pending");

  const [details] = await db.select().from(teams).where(eq(teams.id, team.id));
  const members = await db
    .select({ userId: memberships.userId, email: profiles.email, fullName: profiles.fullName })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(eq(memberships.teamId, team.id))
    .orderBy(asc(profiles.email));
  const invitations = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.teamId, team.id),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
        gt(teamInvitations.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(teamInvitations.email));
  const joinRequests = await db
    .select({ id: teamJoinRequests.id, email: teamJoinRequests.email, fullName: profiles.fullName })
    .from(teamJoinRequests)
    .innerJoin(profiles, eq(profiles.id, teamJoinRequests.userId))
    .where(and(eq(teamJoinRequests.teamId, team.id), isNull(teamJoinRequests.decidedAt)))
    .orderBy(asc(teamJoinRequests.createdAt));
  const lastEmail = members.length === 1;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        {details.name}, <Ltr>{`${details.program} ${details.number}`}</Ltr>
      </p>

      {joinRequests.length > 0 && (
        <section className="flex flex-col gap-3 card-surface p-4" aria-label="בקשות הצטרפות">
          <h2 className="font-semibold">בקשות הצטרפות</h2>
          <ul className="flex flex-col">
            {joinRequests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2 first:border-t-0">
                <div className="min-w-0 text-sm">
                  {request.fullName && <div className="font-medium">{request.fullName}</div>}
                  <div className="break-all text-muted">
                    <Ltr>{request.email}</Ltr>
                  </div>
                </div>
                <div className="flex gap-2">
                  <ActionForm action={decideJoinRequest}>
                    <input type="hidden" name="id" value={request.id} />
                    <input type="hidden" name="accept" value="1" />
                    <Button variant="secondary" aria-label={`הוספת ${request.email} לחשבון הקבוצה`}>
                      הוספה
                    </Button>
                  </ActionForm>
                  <ActionForm action={decideJoinRequest}>
                    <input type="hidden" name="id" value={request.id} />
                    <button aria-label={`דחיית הבקשה של ${request.email}`} className="flex min-h-11 items-center px-3 text-sm text-danger hover:underline">
                      דחייה
                    </button>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ActionForm action={updateTeamDetails} className="flex flex-col gap-3 card-surface p-4">
        <h2 className="font-semibold">פרטי הקבוצה</h2>
        <Field label="שם הקבוצה" name="name">
          <Input name="name" required defaultValue={details.name} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="איש קשר" name="contactName">
            <Input name="contactName" defaultValue={details.contactName ?? ""} />
          </Field>
          <Field label="טלפון" name="contactPhone">
            <Input name="contactPhone" dir="ltr" defaultValue={details.contactPhone ?? ""} />
          </Field>
          <Field label="דוא״ל" name="contactEmail">
            <Input name="contactEmail" type="email" dir="ltr" defaultValue={details.contactEmail ?? ""} />
          </Field>
        </div>
        <Field label="כתובת למשלוח" name="address">
          <Input name="address" defaultValue={details.address ?? ""} />
        </Field>
        <Button variant="secondary" className="self-start">
          שמירה
        </Button>
      </ActionForm>

      <section className="flex flex-col gap-3 card-surface p-4">
        <h2 className="font-semibold">כתובות כניסה</h2>
        <p className="text-sm text-muted">
          כל כתובת בחשבון הקבוצה יכולה להזמין, לשלוח בקשות, לאשר הצעות ולנהל את החשבון. אפשר כתובת משותפת אחת או כמה.
        </p>
        <ul className="flex flex-col">
          {members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2">
              <div className="min-w-0 text-sm">
                {member.fullName && <div className="font-medium">{member.fullName}</div>}
                <div className="break-all text-muted">
                  <Ltr>{member.email}</Ltr>
                  {member.userId === viewer.id && <span> (אתם)</span>}
                </div>
              </div>
              {!lastEmail && (
                <ActionForm action={removeMember}>
                  <input type="hidden" name="userId" value={member.userId} />
                  <button
                    aria-label={`הסרת ${member.email}`}
                    className="flex min-h-11 items-center px-3 text-sm text-danger hover:underline"
                  >
                    הסרה
                  </button>
                </ActionForm>
              )}
            </li>
          ))}
          {invitations.map((invitation) => (
            <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2 text-sm">
              <span className="min-w-0 break-all">
                <Ltr>{invitation.email}</Ltr>
                <span className="text-muted">, ממתינה להצטרפות</span>
              </span>
              <form action={revokeInvitation}>
                <input type="hidden" name="id" value={invitation.id} />
                <button
                  aria-label={`ביטול ההזמנה של ${invitation.email}`}
                  className="flex min-h-11 items-center px-3 text-sm text-danger hover:underline"
                >
                  ביטול
                </button>
              </form>
            </li>
          ))}
        </ul>
        <h3 className="mt-2 font-semibold">הוספת כתובת</h3>
        <InviteForm />
      </section>
    </div>
  );
}

export default function TeamPage() {
  return (
    <div>
      <h1 className="mb-6 text-title font-semibold">חשבון הקבוצה</h1>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <Team />
      </Suspense>
    </div>
  );
}
