import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Suspense } from "react";
import { Card, Field, fieldClass, Input } from "@/components/form";
import { Loading, PageSkeleton } from "@/components/skeleton";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getBusiness } from "@/lib/settings";
import { saveBusiness } from "../actions";
import { SettingsForm } from "../settings-form";

export const metadata: Metadata = { title: "הגדרות: פרטי העסק" };

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-section font-semibold">{title}</h2>
        {hint && <p className="text-caption text-muted">{hint}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

function TextArea({ name, defaultValue, rows = 3 }: { name: string; defaultValue: string | null; rows?: number }) {
  return <textarea id={name} name={name} rows={rows} defaultValue={defaultValue ?? ""} className={`${fieldClass} h-auto py-2`} />;
}

async function BusinessForm() {
  await requireAdmin();
  const [b, suppliers] = await Promise.all([
    getBusiness(),
    db.select({ code: schema.suppliers.code, name: schema.suppliers.name }).from(schema.suppliers).orderBy(asc(schema.suppliers.name)),
  ]);
  return (
    <SettingsForm action={saveBusiness} label="שמירת פרטי העסק">
      <p className="text-callout text-muted">שדה ריק לא מופיע באתר. השינויים מופיעים באתר מיד, בלי פריסה.</p>

      <Group title="העסק" hint="בתחתית כל עמוד, בעמוד ״מי אנחנו״ ובהצעת המחיר המודפסת.">
        <Field label="שם העסק הרשום" name="legalName" hint="למשל: קוטס ישראל בע״מ">
          <Input name="legalName" defaultValue={b.legalName ?? ""} />
        </Field>
        <Field label="ח.פ. או עוסק מורשה" name="companyNumber">
          <Input name="companyNumber" defaultValue={b.companyNumber ?? ""} dir="ltr" inputMode="numeric" />
        </Field>
      </Group>

      <Group title="יצירת קשר" hint="בעמוד ״צור קשר״, בתחתית העמוד ובכפתור הוואטסאפ.">
        <Field label="דוא״ל" name="email">
          <Input name="email" type="email" defaultValue={b.email ?? ""} dir="ltr" autoComplete="off" />
        </Field>
        <Field label="טלפון" name="phone" hint="מוצג כפי שנכתב, למשל 03-1234567">
          <Input name="phone" type="tel" defaultValue={b.phone ?? ""} dir="ltr" />
        </Field>
        <Field label="וואטסאפ" name="whatsapp" hint="מספר נייד, למשל 050-1234567">
          <Input name="whatsapp" type="tel" defaultValue={b.whatsapp ? `0${b.whatsapp.replace(/^972/, "")}` : ""} dir="ltr" />
        </Field>
      </Group>

      <Group title="איסוף ומשלוח" hint="בעמוד ״משלוח וזמני אספקה״ ובדף ההזמנה כשהיא מוכנה לאיסוף.">
        <Field label="כתובת איסוף" name="pickupAddress">
          <Input name="pickupAddress" defaultValue={b.pickupAddress ?? ""} />
        </Field>
        <Field label="שעות איסוף" name="pickupHours" hint="למשל: א׳–ה׳ 16:00–19:00">
          <Input name="pickupHours" defaultValue={b.pickupHours ?? ""} />
        </Field>
        <Field label="דמי טיפול" name="handlingFee" hint="משפט אחד, למשל: דמי טיפול של 30 ש״ח להזמנה">
          <Input name="handlingFee" defaultValue={b.handlingFee ?? ""} />
        </Field>
        <Field label="מה כלול במחיר" name="priceIncludes" hint="מופיע אחרי ״כולל״, למשל: משלוח מארה״ב ומכס">
          <Input name="priceIncludes" defaultValue={b.priceIncludes ?? ""} />
        </Field>
      </Group>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold">זמני אספקה לפי ספק</h2>
          <p className="text-caption text-muted">ימים מאישור ההצעה עד המסירה בישראל. בדף המוצר ובעמוד המשלוח.</p>
        </div>
        <ul className="flex flex-col gap-3">
          {suppliers.map((s) => {
            const lead = b.leadTimes[s.code] ?? null;
            return (
              <li key={s.code} className="flex flex-wrap items-end gap-3">
                <span className="min-w-32 pb-3 font-medium">
                  <bdi dir="ltr">{s.name}</bdi>
                </span>
                <label className="flex flex-col gap-1 text-caption text-muted">
                  מינימום
                  <Input name={`lead.${s.code}.min`} type="number" min={0} max={365} inputMode="numeric" defaultValue={lead?.minDays ?? ""} className="w-24" />
                </label>
                <label className="flex flex-col gap-1 text-caption text-muted">
                  מקסימום
                  <Input name={`lead.${s.code}.max`} type="number" min={0} max={365} inputMode="numeric" defaultValue={lead?.maxDays ?? ""} className="w-24" />
                </label>
              </li>
            );
          })}
        </ul>
      </Card>

      <Group title="הצעות מחיר ותשלום" hint="אחרי שליחת בקשה, בהצעת המחיר ובשאלות הנפוצות.">
        <Field label="ימי עסקים עד הצעת מחיר" name="quoteLeadBusinessDays">
          <Input name="quoteLeadBusinessDays" type="number" min={1} max={60} inputMode="numeric" defaultValue={b.quoteLeadBusinessDays ?? ""} />
        </Field>
        <Field label="תוקף הצעה (ימים)" name="quoteValidDays">
          <Input name="quoteValidDays" type="number" min={1} max={365} inputMode="numeric" defaultValue={b.quoteValidDays ?? ""} />
        </Field>
        <Field label="תנאי תשלום" name="paymentTerms" hint="למשל: העברה בנקאית או הזמנת רכש של בית הספר, תוך 30 יום">
          <TextArea name="paymentTerms" defaultValue={b.paymentTerms} rows={2} />
        </Field>
        <Field label="מדיניות החזרות" name="returnPolicy" hint="תקציר קצר, בעמוד ״החזרות״ ובעמוד הבית">
          <TextArea name="returnPolicy" defaultValue={b.returnPolicy} />
        </Field>
      </Group>
    </SettingsForm>
  );
}

export default function BusinessSettingsPage() {
  return (
    <Suspense
      fallback={
        <Loading>
          <PageSkeleton />
        </Loading>
      }
    >
      <BusinessForm />
    </Suspense>
  );
}
