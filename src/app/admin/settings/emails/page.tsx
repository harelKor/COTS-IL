import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Field, Input } from "@/components/form";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { AUDIENCE_LABELS, eventLabel, factTokens, templateKey } from "@/domain/email-overrides";
import { emailAudiences, emailConfig } from "@/domain/notifications";
import { requireAdmin } from "@/lib/auth";
import { renderEmail, renderOptions, tokenValuesFor } from "@/lib/email-templates";
import { sampleFor } from "@/lib/email-samples";
import { getSettings } from "@/lib/settings";
import { SettingsForm } from "../settings-form";
import { saveTimings } from "./actions";
import { EmailTemplates, type TemplateRow } from "./email-forms";

export const metadata: Metadata = { title: "הגדרות: מיילים" };

/** The plain-text paragraphs of a built-in email, without its button's link line. */
function defaultBody(text: string) {
  return text
    .split("\n\n")
    .filter((p) => !/https?:\/\//.test(p))
    .join("\n\n");
}

async function Emails() {
  await requireAdmin();
  const settings = await getSettings();
  const { templates, inviteDays, reminderAfterDays } = settings.content.emails;
  const rows: TemplateRow[] = emailAudiences().flatMap(({ event, audiences }) =>
    audiences.map((audience): TemplateRow => {
      const key = templateKey(event, audience);
      const sample = sampleFor(event);
      const base = sample ? renderEmail(event, audience, sample as never, { ...renderOptions(settings, event, audience), template: null }) : null;
      return {
        key,
        label: eventLabel(event),
        audience: AUDIENCE_LABELS[audience],
        subject: templates[key]?.subject ?? "",
        body: templates[key]?.body ?? "",
        defaultSubject: base?.subject ?? "",
        defaultBody: base ? defaultBody(base.text) : "",
        tokens: sample ? Object.keys(tokenValuesFor(event, sample, factTokens(settings.business))) : Object.keys(factTokens(settings.business)),
        hasSample: !!sample,
      };
    }),
  );
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold">נוסח המיילים</h2>
          <p className="text-caption text-muted">
            נושא וטקסט לכל מייל שהאתר שולח. שדה ריק משאיר את הנוסח המקורי. הכותרת, הטבלה, הכפתור והחתימה נשארים, ובטקסט אפשר להשתמש בפרטים של ההזמנה בסוגריים מסולסלים, למשל
            <code>{" {מספר הזמנה}"}</code>. התצוגה המקדימה והבדיקה מציגות הזמנה לדוגמה.
          </p>
        </div>
        <EmailTemplates rows={rows} canSend={!!emailConfig(process.env)} />
      </Card>
      <Card>
        <SettingsForm action={saveTimings} className="flex flex-col gap-4">
          <h2 className="text-section font-semibold">זמנים</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="תוקף קישור הצטרפות (ימים)" name="inviteDays" hint="כתובת שנוספה לחשבון הקבוצה מקבלת קישור שתקף כל כך הרבה זמן.">
              <Input name="inviteDays" type="number" min={1} max={90} inputMode="numeric" defaultValue={inviteDays} required />
            </Field>
            <Field label="תזכורת על הצעה (ימים)" name="reminderAfterDays" hint="הצעה שלא אושרה כל כך הרבה ימים מקבלת תזכורת אחת.">
              <Input name="reminderAfterDays" type="number" min={1} max={30} inputMode="numeric" defaultValue={reminderAfterDays} required />
            </Field>
          </div>
          <p className="text-caption text-muted">קישור האישור של הצעה תקף כמו ההצעה עצמה: לפי ״תוקף הצעה״ בפרטי העסק (14 ימים כשהוא ריק).</p>
        </SettingsForm>
      </Card>
    </div>
  );
}

export default function EmailsSettingsPage() {
  return (
    <Suspense
      fallback={
        <Loading>
          <PageSkeleton />
        </Loading>
      }
    >
      <Emails />
    </Suspense>
  );
}
