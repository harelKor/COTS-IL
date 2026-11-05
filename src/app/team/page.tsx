import { and, asc, eq, gt, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { db, schema } from "@/db";
import { ActionForm } from "@/components/action-form";
import { Button, Field, Input } from "@/components/form";
import { canManageTeam, ROLE_LABELS } from "@/domain/teams";
import { activeTeam, getViewer } from "@/lib/auth";
import { removeMember, revokeInvitation, setMemberRole, updateTeamDetails } from "./actions";
import { InviteForm } from "./invite-form";
import { Loading, PageSkeleton } from "@/components/skeleton";

export const metadata: Metadata = { title: "הקבוצה" };

const { memberships, profiles, teamInvitations, teams } = schema;

const ROLE_HELP = "מנהל קבוצה מנהל משתמשים ומאשר הצעות. קניין מנהל סל ושולח בקשות. צופה רואה בלבד.";

async function Team() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/team");
  const team = activeTeam(viewer);
  if (!team) redirect(viewer.isAdmin ? "/admin" : "/pending");

  const manage = canManageTeam(team.role);
  const [details] = await db.select().from(teams).where(eq(teams.id, team.id));
  const members = await db
    .select({ userId: memberships.userId, role: memberships.role, email: profiles.email, fullName: profiles.fullName })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(eq(memberships.teamId, team.id))
    .orderBy(asc(profiles.email));
  const invitations = manage
    ? await db
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
        .orderBy(asc(teamInvitations.email))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        {details.name} · <span className="ltr">{`${details.program} ${details.number}`}</span> · ההרשאה שלכם:{" "}
        {ROLE_LABELS[team.role]}
      </p>

      <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <h2 className="font-semibold">משתמשים</h2>
        <p className="text-xs text-muted">{ROLE_HELP}</p>
        <ul className="flex flex-col">
          {members.map((member) => (
            <li key={member.userId} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2">
              <div className="min-w-48 text-sm">
                <div className="font-medium">{member.fullName ?? "ללא שם"}</div>
                <div className="ltr text-xs text-muted">{member.email}</div>
              </div>
              {manage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <ActionForm action={setMemberRole} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="userId" value={member.userId} />
                    <select
                      name="role"
                      defaultValue={member.role}
                      aria-label={`הרשאה של ${member.email}`}
                      className="h-9 rounded-md border border-line bg-surface px-2 text-sm"
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button className="h-9 rounded-md border border-line px-3 text-xs hover:bg-subtle">עדכון</button>
                  </ActionForm>
                  <ActionForm action={removeMember}>
                    <input type="hidden" name="userId" value={member.userId} />
                    <button className="h-9 px-2 text-xs text-danger hover:underline">הסרה</button>
                  </ActionForm>
                </div>
              ) : (
                <span className="text-sm text-muted">{ROLE_LABELS[member.role]}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {manage && (
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <h2 className="font-semibold">הזמנת משתמש</h2>
          <InviteForm />
          {invitations.length > 0 && (
            <ul className="flex flex-col text-sm">
              {invitations.map((invitation) => (
                <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-2">
                  <span>
                    <span className="ltr">{invitation.email}</span> · {ROLE_LABELS[invitation.role]} · ממתין להצטרפות
                  </span>
                  <form action={revokeInvitation}>
                    <input type="hidden" name="id" value={invitation.id} />
                    <button className="text-xs text-danger hover:underline">ביטול</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {manage && (
        <ActionForm action={updateTeamDetails} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
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
          <Button variant="ghost" className="self-start">
            שמירה
          </Button>
        </ActionForm>
      )}
    </div>
  );
}

export default function TeamPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">הקבוצה</h1>
      <Suspense fallback={<Loading><PageSkeleton /></Loading>}>
        <Team />
      </Suspense>
    </div>
  );
}
