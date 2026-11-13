"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Field, Input, StatusTag } from "@/components/form";
import { Ltr } from "@/components/ltr";
import { showToast } from "@/components/toast";
import { isSyncedPlatform, type SupplierDraft } from "@/domain/supplier-detect";
import { accentColor, DEFAULT_ACCENT } from "@/domain/vendors";
import type { SupplierCardData, SyncJobView } from "@/lib/supplier-admin";
import { SettingsForm } from "../settings-form";
import { createSupplier, deleteSupplier, detectSupplier, setSupplierActive, syncStatus, syncSupplierNow, updateSupplier } from "./actions";

const PLATFORM: Record<SupplierCardData["platform"], string> = { shopify: "Shopify", manual: "ידני", bigcommerce: "BigCommerce", csv: "CSV" };

const when = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });

/**
 * The vendor box's glow and outline tint on the home page and in its store. Empty: brand blue.
 * A hex code (6 digits) with a picker beside it; the swatch shows the colour as typed.
 */
function AccentField({ id, initial, name = "accentColor", label = "צבע המותג", hint = "קוד צבע בן 6 ספרות (הקס): הזוהר, המסגרת והגוון של התיבה בדף הבית ובחנות. ריק: הכחול של האתר." }: { id: string; initial: string; name?: string; label?: string; hint?: string }) {
  const [value, setValue] = useState(initial);
  const color = accentColor(value);
  return (
    <Field label={label} name={`${name}-${id}`} hint={hint}>
      <div className="flex items-center gap-2">
        <Input
          id={`${name}-${id}`}
          name={name}
          dir="ltr"
          maxLength={7}
          pattern="#[0-9a-fA-F]{6}"
          value={value}
          onChange={(e) => setValue(e.target.value.trim())}
          className="w-32 font-mono"
        />
        <input
          type="color"
          aria-label={`בחירת ${label}`}
          value={color ?? DEFAULT_ACCENT}
          onChange={(e) => setValue(e.target.value)}
          className="size-11 cursor-pointer rounded-xl border border-line bg-surface p-1"
        />
        {value && (
          <button type="button" onClick={() => setValue("")} className="flex min-h-11 items-center px-2 text-caption text-brand hover:underline">
            ברירת מחדל
          </button>
        )}
      </div>
    </Field>
  );
}

function Logo({ src, name }: { src: string | null; name: string }) {
  return (
    <span className="tile-fade flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- supplier logos come from any host
        <img src={src} alt="" className="size-full object-contain p-1" loading="lazy" />
      ) : (
        <span aria-hidden className="text-callout font-semibold text-brand-strong">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}

function ProgramBoxes({ selected }: { selected: string[] }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-callout font-medium">תוכניות</legend>
      <div className="flex gap-2">
        {(["FRC", "FTC"] as const).map((p) => (
          <label key={p} className="flex min-h-11 items-center gap-2 rounded-xl bg-subtle px-3">
            <input type="checkbox" name="programs" value={p} defaultChecked={selected.includes(p)} className="size-5 accent-brand" />
            <Ltr>{p}</Ltr>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** "הוספת ספק": paste a URL, check what was found, save. */
export function AddSupplier() {
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<SupplierDraft | null>(null);
  const [logo, setLogo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, start] = useTransition();
  const router = useRouter();

  function check() {
    setError(null);
    start(async () => {
      const r = await detectSupplier(url);
      if (!r.ok) {
        setDraft(null);
        setError(r.error);
        return;
      }
      setDraft(r.draft);
      setLogo(r.draft.logoUrl ?? "");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <div className="flex-1">
          <Field label="כתובת החנות" name="storeUrl" hint="למשל revrobotics.com. נזהה את השם, הלוגו ואם זו חנות Shopify או BigCommerce.">
            <Input name="storeUrl" type="text" inputMode="url" dir="ltr" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" autoComplete="off" />
          </Field>
        </div>
        <Button type="submit" variant={draft ? "secondary" : "primary"} disabled={checking || !url.trim()}>
          {checking ? "בודק…" : "בדיקה"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-callout text-danger">
          {error}
        </p>
      )}

      {draft && (
        <SettingsForm
          key={draft.baseUrl}
          label="הוספת הספק"
          pendingLabel="מוסיף…"
          action={async (prev, formData) => {
            const r = await createSupplier(prev, formData);
            if (r.ok) {
              setDraft(null);
              setUrl("");
              router.refresh();
            }
            return r;
          }}
        >
          <div className="flex items-center gap-3 rounded-xl bg-brand-soft px-3 py-2 text-callout">
            <Logo src={logo || null} name={draft.name} />
            <span>
              {draft.platform === "shopify" ? (
                <>
                  חנות <Ltr>Shopify</Ltr>: החלקים יסונכרנו אוטומטית, כל לילה.
                </>
              ) : draft.platform === "bigcommerce" ? (
                <>
                  חנות <Ltr>BigCommerce</Ltr>
                  {draft.sampleProducts ? <> עם {draft.sampleProducts.toLocaleString("he-IL")} דפי מוצר</> : null}: נקרא דף אחר דף, פעם בשבוע במלואו, ובכל לילה החלקים שבעגלות ובהזמנות.
                </>
              ) : (
                <>לא נמצא קטלוג Shopify. הספק יישמר כספק ידני, והחלקים שלו יתווספו ידנית.</>
              )}
            </span>
          </div>
          <input type="hidden" name="platform" value={draft.platform} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="שם" name="name">
              <Input name="name" required maxLength={80} defaultValue={draft.name} />
            </Field>
            <Field label="קוד" name="code" hint="אותיות קטנות באנגלית וספרות. מופיע בכתובות ולא משתנה אחר כך.">
              <Input name="code" required dir="ltr" pattern="[a-z0-9][a-z0-9\-]{1,23}" defaultValue={draft.code} />
            </Field>
            <Field label="כתובת" name="baseUrl">
              <Input name="baseUrl" required dir="ltr" defaultValue={draft.baseUrl} />
            </Field>
            <Field label="כתובת הלוגו" name="logoUrl" hint="אפשר להעלות קובץ אחר כך, בעריכת הספק.">
              <Input name="logoUrl" type="url" dir="ltr" value={logo} onChange={(e) => setLogo(e.target.value)} />
            </Field>
          </div>
          <ProgramBoxes selected={draft.programs} />
        </SettingsForm>
      )}
    </div>
  );
}

function jobText(job: SyncJobView | null, platform: SupplierCardData["platform"]) {
  if (!isSyncedPlatform(platform)) return "בלי סנכרון אוטומטי";
  if (!job) return "עוד לא סונכרן";
  if (job.status === "running") return `מסתנכרן מאז ${when.format(new Date(job.startedAt))}`;
  const at = when.format(new Date(job.finishedAt ?? job.startedAt));
  return job.status === "succeeded" ? `סונכרן ב-${at}${job.products !== null ? `, ${job.products} מוצרים` : ""}` : `הסנכרון נכשל ב-${at}`;
}

/** "סנכרון עכשיו", then the job's status every 5 s until it finishes (or 15 minutes pass). */
function SyncButton({ supplier, unavailable, onJob }: { supplier: SupplierCardData; unavailable: string | null; onJob: (job: SyncJobView | null) => void }) {
  const [waiting, setWaiting] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!waiting) return;
    const until = Date.now() + 15 * 60_000;
    timer.current = setInterval(async () => {
      const job = await syncStatus(supplier.id);
      const fresh = job && job.startedAt >= waiting;
      if (fresh) onJob(job);
      if ((fresh && job.status !== "running") || Date.now() > until) {
        setWaiting(null);
        router.refresh();
        if (fresh) showToast(job.status === "succeeded" ? `${supplier.name} סונכרן` : `הסנכרון של ${supplier.name} נכשל`, job.status === "succeeded" ? "default" : "error");
      }
    }, 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [waiting, supplier.id, supplier.name, onJob, router]);

  if (!isSyncedPlatform(supplier.platform)) return null;
  const reason = unavailable ?? (!supplier.active ? "הספק מוסתר" : null);
  return (
    <span className="flex flex-col gap-1">
      <Button
        type="button"
        variant="secondary"
        disabled={!!reason || pending || !!waiting}
        aria-describedby={reason ? `sync-reason-${supplier.id}` : undefined}
        onClick={() =>
          start(async () => {
            const r = await syncSupplierNow(supplier.id);
            showToast(r.ok ? (r.message ?? "התחיל") : r.error, r.ok ? "default" : "error");
            if (r.ok && r.since) setWaiting(r.since);
          })
        }
      >
        {waiting ? "ממתין לסנכרון…" : pending ? "מתחיל…" : "סנכרון עכשיו"}
      </Button>
      {reason && (
        <span id={`sync-reason-${supplier.id}`} className="text-caption text-muted">
          {reason}
        </span>
      )}
    </span>
  );
}

/** One supplier: what it is, its last sync, the hide switch, and its settings. */
export function SupplierCard({
  supplier,
  lead,
  multiplier,
  globalMarkup,
  syncUnavailable,
}: {
  supplier: SupplierCardData;
  lead: { minDays: number; maxDays: number } | null;
  multiplier: number | null;
  globalMarkup: number;
  syncUnavailable: string | null;
}) {
  // While "סנכרון עכשיו" is followed, its newer job wins over the one the page loaded with.
  const [liveJob, setJob] = useState<SyncJobView | null>(null);
  const job = liveJob && (!supplier.lastJob || liveJob.startedAt >= supplier.lastJob.startedAt) ? liveJob : supplier.lastJob;
  const [toggling, startToggle] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, startDelete] = useTransition();
  const router = useRouter();
  const failed = job?.status === "failed";

  function toggle(active: boolean) {
    startToggle(async () => {
      const r = await setSupplierActive(supplier.id, active);
      router.refresh();
      showToast(r.ok ? (r.message ?? "נשמר") : r.error, r.ok ? "default" : "error", r.ok ? { label: "ביטול", run: () => void setSupplierActive(supplier.id, !active).then(() => router.refresh()) } : undefined);
    });
  }

  return (
    <li className={`card-surface flex flex-col gap-3 p-4 sm:p-5 ${supplier.active ? "" : "opacity-80"}`}>
      <div className="flex items-start gap-3">
        <Logo src={supplier.logoUrl} name={supplier.name} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-body font-semibold">
              <Ltr>{supplier.name}</Ltr>
            </h3>
            <StatusTag tone={isSyncedPlatform(supplier.platform) ? "brand" : "neutral"}>{PLATFORM[supplier.platform]}</StatusTag>
            {!supplier.active && <StatusTag tone="warning">מוסתר</StatusTag>}
            {isSyncedPlatform(supplier.platform) && !supplier.syncEnabled && <StatusTag>בלי סנכרון לילי</StatusTag>}
          </div>
          <a href={supplier.baseUrl} target="_blank" rel="noreferrer" className="truncate text-caption text-brand hover:underline">
            <Ltr>{supplier.baseUrl.replace(/^https?:\/\//, "")}</Ltr>
          </a>
          <p className="text-caption text-muted">
            {supplier.products} מוצרים, <Ltr>{supplier.programs.join(" / ")}</Ltr>
          </p>
          <p className={`text-caption ${failed ? "text-danger" : "text-muted"}`} aria-live="polite">
            {jobText(job, supplier.platform)}
          </p>
          {failed && job?.error && <p className="line-clamp-2 text-caption text-danger">{job.error}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={supplier.active}
          aria-label={`${supplier.name} מוצג בקטלוג`}
          disabled={toggling}
          onClick={() => toggle(!supplier.active)}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-full px-2 text-caption text-muted disabled:opacity-50"
        >
          <span className={`relative h-6 w-10 rounded-full transition-colors ${supplier.active ? "bg-brand" : "bg-line"}`}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all ${supplier.active ? "inset-inline-start-[18px]" : "inset-inline-start-0.5"}`} />
          </span>
          {toggling ? "מעדכן…" : supplier.active ? "מוצג" : "מוסתר"}
        </button>
      </div>

      <div className="flex flex-wrap items-start gap-2">
        <SyncButton supplier={supplier} unavailable={syncUnavailable} onJob={setJob} />
      </div>

      <details className="group rounded-xl border border-line">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-callout font-medium text-brand">עריכה</summary>
        <div className="flex flex-col gap-4 border-t border-line p-3">
          <SettingsForm
            action={async (prev, formData) => {
              const r = await updateSupplier(prev, formData);
              if (r.ok) router.refresh();
              return r;
            }}
            pendingLabel="שומר…"
          >
            <input type="hidden" name="id" value={supplier.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="שם" name={`name-${supplier.id}`}>
                <Input id={`name-${supplier.id}`} name="name" required maxLength={80} defaultValue={supplier.name} />
              </Field>
              <Field label="כתובת" name={`baseUrl-${supplier.id}`}>
                <Input id={`baseUrl-${supplier.id}`} name="baseUrl" required dir="ltr" defaultValue={supplier.baseUrl} />
              </Field>
              <Field label="כתובת הלוגו" name={`logoUrl-${supplier.id}`} hint="או העלו קובץ (PNG, JPG או WebP, עד 700KB)">
                <Input id={`logoUrl-${supplier.id}`} name="logoUrl" type="url" dir="ltr" defaultValue={supplier.logoUrl ?? ""} />
              </Field>
              <AccentField id={supplier.id} initial={supplier.accentColor ?? ""} />
              <AccentField
                id={supplier.id}
                initial={supplier.accentColor2 ?? ""}
                name="accentColor2"
                label="צבע מותג משני"
                hint="לשני צבעים, כמו ירוק ושחור: הצבע השני במסגרת ובזוהר. ריק: גוון בהיר של הראשון."
              />
              <Field label="העלאת לוגו" name={`logoFile-${supplier.id}`}>
                <Input id={`logoFile-${supplier.id}`} name="logoFile" type="file" accept="image/png,image/jpeg,image/webp" className="py-2" />
              </Field>
              <Field label="זמן אספקה לישראל (ימים)" name={`leadMin-${supplier.id}`} hint="מאישור ההצעה עד המסירה. בדף המוצר ובעמוד המשלוח.">
                <div className="flex items-center gap-2">
                  <Input id={`leadMin-${supplier.id}`} name="leadMin" type="number" min={0} max={365} inputMode="numeric" aria-label="מינימום" placeholder="מ-" defaultValue={lead?.minDays ?? ""} className="w-24" />
                  <Input id={`leadMax-${supplier.id}`} name="leadMax" type="number" min={0} max={365} inputMode="numeric" aria-label="מקסימום" placeholder="עד" defaultValue={lead?.maxDays ?? ""} className="w-24" />
                </div>
              </Field>
              <Field label="מקדם מחיר לספק" name={`multiplier-${supplier.id}`} hint={`ריק = המקדם הכללי (${globalMarkup}). שמירה מעדכנת את המחירים.`}>
                <Input id={`multiplier-${supplier.id}`} name="multiplier" type="number" min={1} max={5} step={0.01} inputMode="decimal" dir="ltr" defaultValue={multiplier ?? ""} placeholder={String(globalMarkup)} />
              </Field>
              <Field label="משלוח חינם מעל (דולר)" name={`freeShippingUsd-${supplier.id}`}>
                <Input id={`freeShippingUsd-${supplier.id}`} name="freeShippingUsd" type="number" min={0} step={1} inputMode="decimal" dir="ltr" defaultValue={supplier.freeShippingUsd ?? ""} />
              </Field>
              <ProgramBoxes selected={supplier.programs} />
            </div>
            <Field label="הערות (רק למנהלים)" name={`notes-${supplier.id}`}>
              <textarea id={`notes-${supplier.id}`} name="notes" rows={3} maxLength={2000} defaultValue={supplier.notes ?? ""} className="rounded-xl border border-transparent bg-subtle p-3 text-base outline-none focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/20" />
            </Field>
            {isSyncedPlatform(supplier.platform) && (
              <label className="flex min-h-11 items-center gap-2 text-callout">
                <input type="checkbox" name="syncEnabled" defaultChecked={supplier.syncEnabled} className="size-5 accent-brand" />
                סנכרון כל לילה
              </label>
            )}
            {!isSyncedPlatform(supplier.platform) && <input type="hidden" name="syncEnabled" value={supplier.syncEnabled ? "on" : ""} />}
          </SettingsForm>

          <div className="flex flex-col gap-2 border-t border-line pt-3">
            {supplier.canDelete ? (
              confirmDelete ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-callout">למחוק את {supplier.name} ואת כל {supplier.products} המוצרים שלו? אי אפשר לבטל.</span>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={deleting}
                    onClick={() =>
                      startDelete(async () => {
                        const r = await deleteSupplier(supplier.id);
                        showToast(r.ok ? (r.message ?? "נמחק") : r.error, r.ok ? "default" : "error");
                        router.refresh();
                      })
                    }
                  >
                    {deleting ? "מוחק…" : "מחיקה סופית"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    השארה
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="danger" className="self-start" onClick={() => setConfirmDelete(true)}>
                  מחיקת הספק
                </Button>
              )
            ) : (
              <p className="text-caption text-muted">יש הזמנות עם חלקים של הספק הזה, אז אי אפשר למחוק אותו. אפשר להסתיר אותו במתג למעלה: הוא והחלקים שלו ייעלמו מהקטלוג, וההזמנות יישארו.</p>
            )}
          </div>
        </div>
      </details>
    </li>
  );
}

