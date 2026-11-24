import { Card, StatusTag } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { billingParty, clientSuggestions, nameWords, type MorningClientLite, type TeamBilling } from "@/domain/morning";
import { findMorningClients, getMorningClient, morningConfig } from "@/lib/morning";
import { createTeamMorningClient, linkMorningClient, saveTeamBilling, unlinkMorningClient } from "./actions";
import { BillingForm } from "@/components/billing-form";
import { MorningButton } from "./morning-forms";

const WHY: Record<"taxId" | "email" | "name", string> = { taxId: "אותו מספר עוסק", email: "אותו מייל", name: "שם דומה" };

/**
 * P2 on the admin's team page: the team's "פרטי חיוב" and its Morning client (D4): linked, or
 * the clients that may be it (the admin confirms one), or a new client. Hidden without Morning keys.
 */
export async function TeamMorning({ team }: { team: TeamBilling & { id: string; morningClientId: string | null } }) {
  if (!morningConfig()) return null;
  const party = billingParty(team);
  let linked: MorningClientLite | null = null;
  let suggestions: ReturnType<typeof clientSuggestions> = [];
  let error: string | null = null;
  try {
    if (team.morningClientId) linked = await getMorningClient(team.morningClientId);
    else suggestions = clientSuggestions(team, await findMorningClients([...new Set([...nameWords(party.name), ...nameWords(team.name)])], party.email));
  } catch (e) {
    error = e instanceof Error ? e.message : "שגיאה";
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-section font-semibold">חשבונית ירוקה</h2>
        <p className="text-caption text-muted">על שם מי יוצאים המסמכים של הקבוצה, ואיזה לקוח בחשבונית ירוקה הוא הקבוצה. שדה ריק: שם הקבוצה, המייל והכתובת שלה.</p>
      </div>
      <BillingForm action={saveTeamBilling} teamId={team.id} values={team} placeholders={{ name: team.name, email: team.contactEmail ?? "" }} />

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <h3 className="text-callout font-semibold">הלקוח בחשבונית ירוקה</h3>
        {error && <p className="text-caption text-danger">לא הצלחנו לקרוא מחשבונית ירוקה: {error}</p>}
        {team.morningClientId ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2 text-callout">
              <StatusTag tone="success">מקושרת</StatusTag>
              {linked ? <bdi>{linked.name}</bdi> : !error && <span className="text-muted">הלקוח לא נמצא בחשבונית ירוקה</span>}
              {linked?.taxId && (
                <span className="text-muted">
                  <Ltr>{linked.taxId}</Ltr>
                </span>
              )}
            </span>
            <MorningButton action={unlinkMorningClient} fields={{ teamId: team.id }} label="הסרת הקישור" pendingLabel="מסיר…" variant="ghost" />
          </div>
        ) : (
          <>
            <p className="text-caption text-muted">
              {suggestions.length
                ? "אלה לקוחות בחשבונית ירוקה שאולי הם הקבוצה. מקשרים את הנכון, והמסמכים הבאים יוצאים על שמו."
                : "לא נמצא בחשבונית ירוקה לקוח שדומה לקבוצה. המסמך הראשון ייצור לקוח חדש מפרטי החיוב, או שאפשר ליצור אותו עכשיו."}
            </p>
            {suggestions.length > 0 && (
              <ul className="flex flex-col">
                {suggestions.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-2 text-callout first:border-t-0">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <bdi className="font-medium">{c.name}</bdi>
                      {c.taxId && <Ltr>{c.taxId}</Ltr>}
                      <span className="text-caption text-muted">{WHY[c.why]}</span>
                    </span>
                    <MorningButton action={linkMorningClient} fields={{ teamId: team.id, clientId: c.id }} label="קישור" pendingLabel="מקשר…" />
                  </li>
                ))}
              </ul>
            )}
            <MorningButton action={createTeamMorningClient} fields={{ teamId: team.id }} label="יצירת לקוח חדש" pendingLabel="יוצר…" variant="ghost" />
          </>
        )}
      </div>
    </Card>
  );
}
