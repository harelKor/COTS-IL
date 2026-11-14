import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { Suspense } from "react";
import { Card, Field, Input } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { addAdmin } from "../actions";
import { SettingsForm } from "../settings-form";
import { AdminEmailToggle, RemoveAdminButton } from "./admin-forms";

export const metadata: Metadata = { title: "הגדרות: מנהלים" };

async function Admins() {
  const viewer = await requireAdmin();
  const admins = await db
    .select({ id: schema.profiles.id, email: schema.profiles.email, fullName: schema.profiles.fullName })
    .from(schema.profiles)
    .where(eq(schema.profiles.isAdmin, true))
    .orderBy(asc(schema.profiles.email));
  const { adminsOff } = (await getSettings()).content.emails;
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold">מנהלי האתר</h2>
          <p className="text-caption text-muted">
            ״מקבל/ת מיילים״: בקשות חדשות, החלטות של קבוצות והסיכום היומי. מי שמכבה לא מקבל אותם בכלל. התראות על תקלות באתר יוצאות לכל המנהלים.
          </p>
        </div>
        <ul className="divide-y divide-line">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-callout">
              <span className="min-w-0">
                <Ltr className="font-medium break-all">{a.email}</Ltr>
                {a.fullName && <span className="block text-caption text-muted">{a.fullName}</span>}
                {a.id === viewer.id && <span className="block text-caption text-muted">זה אתם</span>}
              </span>
              <span className="flex flex-wrap items-center gap-3">
                <AdminEmailToggle userId={a.id} email={a.email} on={!adminsOff.includes(a.id)} />
                {a.id !== viewer.id && <RemoveAdminButton email={a.email} disabled={admins.length <= 1} />}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <SettingsForm action={addAdmin} label="הוספת מנהל" pendingLabel="מוסיף…">
          <Field label="דוא״ל" name="email" hint="האדם צריך להתחבר לאתר פעם אחת קודם, עם הכתובת הזאת.">
            <Input name="email" type="email" required dir="ltr" autoComplete="off" />
          </Field>
        </SettingsForm>
      </Card>
    </div>
  );
}

export default function AdminsSettingsPage() {
  return (
    <Suspense
      fallback={
        <Loading>
          <PageSkeleton />
        </Loading>
      }
    >
      <Admins />
    </Suspense>
  );
}
