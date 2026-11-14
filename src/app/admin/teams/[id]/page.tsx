import { and, asc, count, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { db, schema } from "@/db";
import { ActionForm } from "@/components/action-form";
import { Button, Card, Field, Input, Select, StatusTag } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { formatDateTime } from "@/components/orders";
import { OrderStatusTag } from "@/components/order-status-tag";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { TeamName } from "@/components/team-name";
import { formatIls } from "@/domain/pricing";
import { canDeleteTeam, historyText, TEAM_STATUS } from "@/domain/team-admin";
import { firstTeamUrl } from "@/domain/teams";
import { requireAdmin } from "@/lib/auth";
import { getOrderStages, listOrders } from "@/lib/orders";
import { reviewTeam } from "../../actions";
import {
  addTeamEmail,
  deleteTeam,
  mergeTeams,
  removeTeamEmail,
  revokeTeamInvitation,
  setTeamStatus,
  transferTeam,
  updateTeam,
} from "../actions";

export const metadata: Metadata = { title: "קבוצה" };

const { auditLog, blockedEmails, deliveries, memberships, profiles, teamInvitations, teamJoinRequests, teams } = schema;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-section font-semibold">{title}</h2>
        {hint && <p className="text-caption text-muted">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

const checkbox = "mt-1 size-5 shrink-0 accent-brand";

async function TeamPage({ params }: PageProps<"/admin/teams/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [team] = await db.select().from(teams).where(eq(teams.id, id));
  if (!team) notFound();

  const members = await db
    .select({
      userId: memberships.userId,
      email: profiles.email,
      fullName: profiles.fullName,
      since: memberships.createdAt,
      otherTeams: sql<number>`(SELECT count(*)::int FROM memberships o WHERE o.user_id = ${memberships.userId} AND o.team_id <> ${team.id})`,
    })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(eq(memberships.teamId, team.id))
    .orderBy(asc(memberships.createdAt));
  const invitations = await db
    .select()
    .from(teamInvitations)
    .where(and(eq(teamInvitations.teamId, team.id), isNull(teamInvitations.acceptedAt), isNull(teamInvitations.revokedAt), gt(teamInvitations.expiresAt, new Date())))
    .orderBy(asc(teamInvitations.email));
  const joinRequests = await db
    .select({ id: teamJoinRequests.id, email: teamJoinRequests.email, at: teamJoinRequests.createdAt })
    .from(teamJoinRequests)
    .where(and(eq(teamJoinRequests.teamId, team.id), isNull(teamJoinRequests.decidedAt)))
    .orderBy(asc(teamJoinRequests.createdAt));
  const blocked = members.length
    ? new Set(
        (await db.select({ email: blockedEmails.email }).from(blockedEmails).where(inArray(blockedEmails.email, members.map((m) => m.email.toLowerCase())))).map((b) => b.email),
      )
    : new Set<string>();
  const orders = await listOrders(team.id);
  const stages = await getOrderStages(orders);
  const [delivered] = await db.select({ n: count() }).from(deliveries).where(eq(deliveries.teamId, team.id));
  const otherTeams = await db
    .select({ id: teams.id, name: teams.name, program: teams.program, number: teams.number })
    .from(teams)
    .where(ne(teams.id, team.id))
    .orderBy(asc(teams.program), asc(teams.number));
  const history = await db
    .select({ id: auditLog.id, at: auditLog.at, entity: auditLog.entity, action: auditLog.action, before: auditLog.before, after: auditLog.after, actor: profiles.email })
    .from(auditLog)
    .leftJoin(profiles, eq(profiles.id, auditLog.actorId))
    .where(
      or(
        and(eq(auditLog.entity, "team"), eq(auditLog.entityId, team.id)),
        and(eq(auditLog.entity, "membership"), sql`${auditLog.entityId} LIKE ${`${team.id}:%`}`),
        and(inArray(auditLog.entity, ["team_invitation", "team_join_request"]), sql`${auditLog.after}->>'teamId' = ${team.id}`),
      ),
    )
    .orderBy(desc(auditLog.at))
    .limit(100);

  const status = TEAM_STATUS[team.status];
  const deletable = canDeleteTeam({ orders: orders.length, deliveries: delivered.n });
  const lastEmail = members.length === 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/teams" className="inline-flex min-h-11 w-fit items-center gap-1 text-callout text-brand hover:underline">
          <ArrowRight size={16} aria-hidden="true" />
          כל הקבוצות
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-title font-semibold">
            <TeamName team={team} />
          </h1>
          <StatusTag tone={status.tone}>{status.label}</StatusTag>
          <a
            href={firstTeamUrl(team.program, team.number)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1 text-callout text-brand hover:underline"
          >
            דף הקבוצה ב-FIRST
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
        <p className="text-caption text-muted">
          נרשמה ב-<Ltr>{formatDateTime(team.createdAt)}</Ltr>
          {team.rejectionReason && `, סיבה: ${team.rejectionReason}`}
        </p>
      </div>

      {team.status === "pending" && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-callout">הקבוצה ממתינה לאישור.</p>
          <div className="flex flex-wrap gap-2">
            <form action={reviewTeam}>
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="decision" value="active" />
              <Button variant="secondary">אישור</Button>
            </form>
            <form action={reviewTeam}>
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="decision" value="rejected" />
              <Button variant="danger">דחייה</Button>
            </form>
          </div>
        </Card>
      )}

      <Section title="פרטי הקבוצה" hint="אותן בדיקות כמו בהרשמה. מספר שכבר של קבוצה אחרת לא נשמר: אחדו את הקבוצות, או העבירו את המספר.">
        <ActionForm action={updateTeam} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="teamId" value={team.id} />
          <Field label="שם הקבוצה" name="name">
            <Input name="name" defaultValue={team.name} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="תוכנית" name="program">
              <Select name="program" defaultValue={team.program}>
                <option value="FRC">FRC</option>
                <option value="FTC">FTC</option>
              </Select>
            </Field>
            <Field label="מספר" name="number">
              <Input name="number" defaultValue={team.number} inputMode="numeric" dir="ltr" required />
            </Field>
          </div>
          <Field label="איש קשר" name="contactName">
            <Input name="contactName" defaultValue={team.contactName ?? ""} />
          </Field>
          <Field label="טלפון" name="contactPhone">
            <Input name="contactPhone" type="tel" defaultValue={team.contactPhone ?? ""} dir="ltr" />
          </Field>
          <Field label="דוא״ל ליצירת קשר" name="contactEmail" hint="לא משנה את כתובות הכניסה">
            <Input name="contactEmail" type="email" defaultValue={team.contactEmail ?? ""} dir="ltr" />
          </Field>
          <Field label="כתובת" name="address">
            <Input name="address" defaultValue={team.address ?? ""} />
          </Field>
          <div className="sm:col-span-2">
            <Button variant="secondary">שמירת הפרטים</Button>
          </div>
        </ActionForm>
      </Section>

      <Section title="כתובות כניסה" hint="כל כתובת בחשבון הקבוצה יכולה לבנות סל, לשלוח ולאשר. הכתובת האחרונה לא מוסרת.">
        {members.length === 0 ? (
          <p className="text-callout text-warning">אין לקבוצה כתובת כניסה. הוסיפו אחת למטה.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    <Ltr className="break-all">{m.email}</Ltr>
                    {blocked.has(m.email.toLowerCase()) && <StatusTag tone="danger">חסומה</StatusTag>}
                  </span>
                  <span className="text-caption text-muted">
                    {m.fullName ? `${m.fullName}, ` : ""}מאז <Ltr>{formatDateTime(m.since)}</Ltr>
                    {m.otherTeams > 0 && `, גם ב-${m.otherTeams === 1 ? "קבוצה נוספת" : `${m.otherTeams} קבוצות נוספות`}`}
                  </span>
                </div>
                {!lastEmail && (
                  <ActionForm action={removeTeamEmail} className="flex flex-col items-end gap-1">
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="userId" value={m.userId} />
                    <Button variant="ghost" className="text-danger!">
                      הסרה
                    </Button>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}

        {invitations.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-callout font-medium">ממתינות לכניסה ראשונה</h3>
            <ul className="flex flex-col gap-1">
              {invitations.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-callout">
                    <Ltr>{inv.email}</Ltr>
                    <span className="text-caption text-muted">
                      , בתוקף עד <Ltr>{formatDateTime(inv.expiresAt)}</Ltr>
                    </span>
                  </span>
                  <form action={revokeTeamInvitation}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input type="hidden" name="id" value={inv.id} />
                    <Button variant="ghost">ביטול</Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        {joinRequests.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-callout font-medium">בקשות הצטרפות שהקבוצה עוד לא ענתה עליהן</h3>
            <ul className="flex flex-col gap-1 text-callout">
              {joinRequests.map((r) => (
                <li key={r.id}>
                  <Ltr>{r.email}</Ltr>
                  <span className="text-caption text-muted">
                    , <Ltr>{formatDateTime(r.at)}</Ltr>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-caption text-muted">להוסיף אחת מהן בעצמכם: הקלידו אותה למטה.</p>
          </div>
        )}

        <ActionForm action={addTeamEmail} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="teamId" value={team.id} />
          <div className="min-w-60 flex-1">
            <Field label="הוספת כתובת" name="email" hint="מי שכבר נכנס/ה לאתר מצטרף/ת מיד; אחרים בכניסה הראשונה">
              <Input name="email" type="email" dir="ltr" autoComplete="off" required />
            </Field>
          </div>
          <Button variant="secondary">הוספה</Button>
        </ActionForm>
      </Section>

      <Section title={`הזמנות (${orders.length})`}>
        {orders.length === 0 ? (
          <p className="text-callout text-muted">אין הזמנות.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin?open=${o.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-3 py-2 hover:text-brand">
                  <span className="flex flex-col">
                    <span className="font-medium">הזמנה {o.number}</span>
                    <span className="text-caption text-muted">
                      <Ltr>{formatDateTime(o.submittedAt)}</Ltr>
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-callout">{formatIls(o.quoteTotal ?? o.requestTotal)}</span>
                    <OrderStatusTag status={stages.get(o.id)!} audience="admin" pickup={o.deliveryMethod === "pickup"} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* M3: the team's payment status goes here, between its orders and the actions. */}

      <Section title="השהיה" hint="קבוצה מושהית לא שולחת בקשות ולא מאשרת הצעות, אבל רואה את ההזמנות שלה.">
        {team.status === "active" || team.status === "pending" ? (
          <ActionForm action={setTeamStatus} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="change" value="suspend" />
            <div className="min-w-60 flex-1">
              <Field label="סיבה (הקבוצה רואה אותה)" name="reason">
                <Input name="reason" maxLength={500} />
              </Field>
            </div>
            <Button variant="danger">השהיית החשבון</Button>
          </ActionForm>
        ) : (
          <ActionForm action={setTeamStatus}>
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="change" value="reactivate" />
            <Button variant="secondary">{team.status === "suspended" ? "הפעלה מחדש" : "אישור הקבוצה בכל זאת"}</Button>
          </ActionForm>
        )}
      </Section>

      <Section
        title="העברת המספר לקבוצה האמיתית"
        hint={`מישהו תפס את ${team.program} ${team.number} בטעות? הקלידו את הכתובת של הקבוצה האמיתית. ההזמנות נשארות בקבוצה; אפשר להעביר הזמנה לקבוצה אחרת מכרטיס ההזמנה.`}
      >
        <ActionForm action={transferTeam} className="flex flex-col gap-4">
          <input type="hidden" name="teamId" value={team.id} />
          <Field label="כתובת הדוא״ל של הקבוצה האמיתית" name="transfer-email">
            <Input id="transfer-email" name="email" type="email" dir="ltr" autoComplete="off" required />
          </Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-callout font-medium">הכתובות הנוכחיות</legend>
            <label className="flex min-h-11 items-start gap-3">
              <input type="radio" name="mode" value="replace" defaultChecked className={checkbox} />
              <span className="text-callout">
                להחליף: כל הכתובות הנוכחיות יוצאות, והסל והזמנות ההצטרפות ששלחו מתבטלים
              </span>
            </label>
            <label className="flex min-h-11 items-start gap-3">
              <input type="radio" name="mode" value="add" className={checkbox} />
              <span className="text-callout">להשאיר, ולהוסיף את הכתובת החדשה לצידן</span>
            </label>
          </fieldset>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" name="block" className={checkbox} />
            <span className="text-callout">לחסום את הכתובות שיוצאות, כדי שלא יוכלו לרשום קבוצה או לבקש להצטרף שוב</span>
          </label>
          <div>
            <Button variant="secondary">העברת המספר</Button>
          </div>
        </ActionForm>
      </Section>

      <Section title="איחוד קבוצה כפולה" hint="הכתובות, הסל, ההזמנות והמשלוחים של הקבוצה הזאת עוברים לקבוצה שתבחרו, והקבוצה הזאת נמחקת. השם, המספר והסטטוס של הקבוצה השנייה נשארים.">
        <ActionForm action={mergeTeams} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="teamId" value={team.id} />
          <div className="min-w-60 flex-1">
            <Field label="לאחד לתוך" name="intoId">
              <Select name="intoId" defaultValue="" required className="w-full">
                <option value="" disabled>
                  בחרו קבוצה
                </option>
                {otherTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {`${t.program} ${t.number}, ${t.name}`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button variant="danger">איחוד ומחיקת הקבוצה הזאת</Button>
        </ActionForm>
      </Section>

      <Section title="מחיקה" hint="לנתוני בדיקה. קבוצה עם הזמנות לא נמחקת: השהו אותה או אחדו אותה.">
        {deletable ? (
          <ActionForm action={deleteTeam} className="flex flex-col gap-3">
            <input type="hidden" name="teamId" value={team.id} />
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" name="withUsers" defaultChecked className={checkbox} />
              <span className="text-callout">גם למחוק את המשתמשים שלה שאינם בקבוצה אחרת (לא מנהלים)</span>
            </label>
            <div>
              <Button variant="danger">מחיקת הקבוצה</Button>
            </div>
          </ActionForm>
        ) : (
          <p className="text-callout text-muted">לקבוצה יש הזמנות או משלוחים, אז היא לא נמחקת.</p>
        )}
      </Section>

      <Section title="היסטוריית פעולות" hint="100 הפעולות האחרונות על הקבוצה, כתובות הכניסה והזמנות ההצטרפות.">
        {history.length === 0 ? (
          <p className="text-callout text-muted">אין פעולות רשומות.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                <span className="text-callout">{historyText(h)}</span>
                <span className="text-caption text-muted">
                  <Ltr>{formatDateTime(h.at)}</Ltr>
                  {h.actor && (
                    <>
                      , <Ltr>{h.actor}</Ltr>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

export default function AdminTeamPage(props: PageProps<"/admin/teams/[id]">) {
  return (
    <Suspense
      fallback={
        <Loading>
          <PageSkeleton />
        </Loading>
      }
    >
      <TeamPage {...props} />
    </Suspense>
  );
}
