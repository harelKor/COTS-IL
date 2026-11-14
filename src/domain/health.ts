/**
 * The site's health list (M1): one place that says whether the background work a mentor can't
 * see is still running. Each check is ok, yellow (look soon) or red (broken now), with a Hebrew
 * line and a link to where it's fixed. The admin banner, the "בריאות האתר" card on
 * /admin/settings/system, the Vercel Cron watchdog and /api/health all read this list.
 * Pure: src/lib/health.ts gathers the input.
 */

export type Level = "ok" | "yellow" | "red";

export type HealthCheck = {
  /** Stable id: "sync:<code>", "rate", "backup", "revalidate", "daily_digest", "watchdog", "email", "github", "admins". */
  key: string;
  level: Level;
  /** What is checked, e.g. "סנכרון WCP". */
  label: string;
  /** Its state in one Hebrew sentence. */
  line: string;
  /** Technical detail (an error message, usually English), shown left to right under the line. */
  detail?: string;
  /** Where to fix it: an admin path, or an outside dashboard (https://…). */
  href: string;
};

/** The jobs that report to job_runs. */
export const JOBS = ["backup", "revalidate", "daily_digest", "watchdog"] as const;
export type Job = (typeof JOBS)[number];

export type SyncJobState = { status: "running" | "succeeded" | "failed"; startedAt: Date; error: string | null };

export type SupplierSync = {
  code: string;
  name: string;
  platform: string;
  createdAt: Date;
  /** When its latest successful sync finished. */
  lastSuccessAt: Date | null;
  /** BigCommerce: the latest successful full read (the other nights only refresh some parts). */
  lastFullSuccessAt: Date | null;
  latest: SyncJobState | null;
};

export type JobHistory = { lastRun: { ok: boolean; at: Date } | null; lastSuccessAt: Date | null };

export type TokenStatus =
  | { state: "missing" }
  | { state: "valid"; expiresAt: Date | null }
  | { state: "rejected"; status: number }
  | { state: "unreachable" };

export type HealthInput = {
  now: Date;
  /** Suppliers the nightly sync covers (active, not manual, sync on). */
  suppliers: SupplierSync[];
  /** The latest Bank of Israel rate date ("YYYY-MM-DD"), and whether a manual rate replaces it. */
  rate: { rateDate: string; manual: boolean } | null;
  jobs: Record<Job, JobHistory>;
  emails: { on: boolean; sent7d: number; failed7d: number; lastFailed: boolean };
  github: TokenStatus;
  admins: number;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A supplier with no successful sync for this long is red. */
export const SYNC_RED_HOURS = 36;
/** A sync job still "running" after this long died without saying so. */
export const SYNC_STUCK_HOURS = 3;
/** goBILDA and REV are read in full weekly; past this, a yellow. */
export const FULL_READ_YELLOW_DAYS = 8;
export const RATE_YELLOW_DAYS = 5;
/** The nightly jobs (backup, revalidate, digest) are red after this long without a success. */
export const JOB_RED_HOURS = 36;
export const WATCHDOG_YELLOW_HOURS = 48;
export const TOKEN_YELLOW_DAYS = 30;
/** Past this many days without a successful sync, a supplier's parts show "המחיר ייבדק בהצעה". */
export const STALE_PRICE_DAYS = 4;
/** The watchdog repeats an unchanged red alert after this many days. */
export const ALERT_REPEAT_DAYS = 3;

const GITHUB_ACTIONS = "https://github.com/harelKor/COTS-IL/actions";
export const HEALTH_LINKS = {
  suppliers: "/admin/settings/suppliers",
  pricing: "/admin/settings/pricing#rate",
  backup: `${GITHUB_ACTIONS}/workflows/backup.yml`,
  sync: `${GITHUB_ACTIONS}/workflows/sync.yml`,
  cron: "https://vercel.com/cots-il/cotsil/settings/cron-jobs",
  email: "/admin/settings/system#email",
  github: "https://github.com/settings/personal-access-tokens",
  admins: "/admin/settings/admins",
} as const;

const dateFmt = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "numeric" });
export const formatDay = (d: Date) => dateFmt.format(d);

/** "לפני 5 שעות", "לפני יומיים". */
export function ago(then: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - then.getTime());
  const hours = Math.floor(ms / HOUR);
  if (hours < 1) return "לפני פחות משעה";
  if (hours < 48) return hours === 1 ? "לפני שעה" : hours === 2 ? "לפני שעתיים" : `לפני ${hours} שעות`;
  const days = Math.floor(ms / DAY);
  return days === 2 ? "לפני יומיים" : `לפני ${days} ימים`;
}

const olderThan = (then: Date | null, now: Date, ms: number) => !then || now.getTime() - then.getTime() > ms;

export function syncCheck(s: SupplierSync, now: Date): HealthCheck {
  const base = { key: `sync:${s.code}`, label: `סנכרון ${s.name}`, href: HEALTH_LINKS.suppliers };
  const latest = s.latest;
  const stuck = latest?.status === "running" && olderThan(latest.startedAt, now, SYNC_STUCK_HOURS * HOUR);
  const failed = latest?.status === "failed" || stuck;
  const failure = stuck ? `ריצה נתקעה (התחילה ${ago(latest!.startedAt, now)})` : latest?.status === "failed" ? `הריצה האחרונה נכשלה ${ago(latest.startedAt, now)}` : null;
  const detail = latest?.status === "failed" && latest.error ? { detail: latest.error.slice(0, 200) } : {};
  if (!s.lastSuccessAt) {
    if (!olderThan(s.createdAt, now, SYNC_RED_HOURS * HOUR) && !failed) return { ...base, level: "yellow", line: "ממתין לסנכרון הראשון" };
    return { ...base, level: "red", line: failure ? `עוד לא סונכרן בהצלחה. ${failure}` : "עוד לא סונכרן בהצלחה", ...detail };
  }
  if (olderThan(s.lastSuccessAt, now, SYNC_RED_HOURS * HOUR)) {
    return { ...base, level: "red", line: `לא סונכרן בהצלחה מאז ${formatDay(s.lastSuccessAt)} (${ago(s.lastSuccessAt, now)})${failure ? `. ${failure}` : ""}`, ...detail };
  }
  if (failure) return { ...base, level: "yellow", line: `${failure}. הסנכרון המוצלח האחרון ${ago(s.lastSuccessAt, now)}`, ...detail };
  if (s.platform === "bigcommerce" && olderThan(s.lastFullSuccessAt, now, FULL_READ_YELLOW_DAYS * DAY)) {
    return {
      ...base,
      level: "yellow",
      line: s.lastFullSuccessAt ? `הקריאה המלאה האחרונה של החנות ${ago(s.lastFullSuccessAt, now)}; בינתיים מתעדכנים רק חלקים בעגלות ובהזמנות` : "החנות עוד לא נקראה במלואה",
    };
  }
  return { ...base, level: "ok", line: `סונכרן ${ago(s.lastSuccessAt, now)}` };
}

export function rateCheck(rate: HealthInput["rate"], now: Date): HealthCheck {
  const base = { key: "rate", label: "שער הדולר", href: HEALTH_LINKS.pricing };
  if (!rate) return { ...base, level: "red", line: "אין שער דולר במסד: אי אפשר לתמחר. קבעו שער ידני בתמחור" };
  const date = new Date(`${rate.rateDate}T00:00:00Z`);
  const stale = olderThan(date, now, RATE_YELLOW_DAYS * DAY);
  if (rate.manual) return { ...base, level: "ok", line: `שער ידני פעיל (שער בנק ישראל האחרון מ-${formatDay(date)})` };
  if (stale) return { ...base, level: "yellow", line: `שער בנק ישראל לא התעדכן מאז ${formatDay(date)}. אפשר לקבוע שער ידני בתמחור` };
  return { ...base, level: "ok", line: `שער בנק ישראל מ-${formatDay(date)}` };
}

const JOB_META: Record<Job, { label: string; href: string; maxHours: number; never: string }> = {
  backup: { label: "גיבוי לילי", href: HEALTH_LINKS.backup, maxHours: JOB_RED_HOURS, never: "עוד לא דווח גיבוי" },
  revalidate: { label: "רענון הקטלוג אחרי הסנכרון", href: HEALTH_LINKS.sync, maxHours: JOB_RED_HOURS, never: "עוד לא דווח" },
  daily_digest: { label: "תזכורות ותקציר יומי", href: HEALTH_LINKS.sync, maxHours: JOB_RED_HOURS, never: "עוד לא דווח" },
  watchdog: { label: "בדיקה יומית (Vercel Cron)", href: HEALTH_LINKS.cron, maxHours: WATCHDOG_YELLOW_HOURS, never: "עוד לא רצה" },
};

export function jobCheck(job: Job, history: JobHistory, now: Date): HealthCheck {
  const meta = JOB_META[job];
  const base = { key: job, label: meta.label, href: meta.href };
  // The watchdog sends the alerts, so when it stops nobody can be emailed: a yellow, seen in admin.
  const broken: Level = job === "watchdog" ? "yellow" : "red";
  const { lastRun, lastSuccessAt } = history;
  if (!lastRun) return { ...base, level: "yellow", line: meta.never };
  if (!lastRun.ok) {
    return { ...base, level: broken, line: `נכשל ${ago(lastRun.at, now)}${lastSuccessAt ? `; הצליח לאחרונה ${ago(lastSuccessAt, now)}` : ""}` };
  }
  if (olderThan(lastSuccessAt, now, meta.maxHours * HOUR)) {
    return { ...base, level: broken, line: `לא רץ מאז ${lastSuccessAt ? `${formatDay(lastSuccessAt)} (${ago(lastSuccessAt, now)})` : "מעולם"}` };
  }
  return { ...base, level: "ok", line: `הצליח ${ago(lastSuccessAt!, now)}` };
}

export function emailCheck(e: HealthInput["emails"]): HealthCheck {
  const base = { key: "email", label: "מיילים", href: HEALTH_LINKS.email };
  if (!e.on) return { ...base, level: "yellow", line: "המייל כבוי (חסרים RESEND_API_KEY ו-EMAIL_FROM ב-Vercel): לא יוצאים מיילים ולא התראות" };
  const failed = e.failed7d === 1 ? "מייל אחד נכשל" : `${e.failed7d} מיילים נכשלו`;
  if (e.lastFailed) return { ...base, level: "red", line: `המייל האחרון נכשל; ${failed} ב-7 הימים האחרונים. שלחו מייל בדיקה` };
  if (e.failed7d > 0) return { ...base, level: "yellow", line: `${failed} ב-7 הימים האחרונים (מתוך ${e.sent7d + e.failed7d})` };
  return { ...base, level: "ok", line: e.sent7d > 0 ? `${e.sent7d} נשלחו ב-7 הימים האחרונים, בלי כשלונות` : "מוגדר; לא נשלחו מיילים ב-7 הימים האחרונים" };
}

export function githubCheck(t: TokenStatus, now: Date): HealthCheck {
  const base = { key: "github", label: "מפתח GitHub (״סנכרון עכשיו״)", href: HEALTH_LINKS.github };
  switch (t.state) {
    case "missing":
      return { ...base, level: "yellow", line: "GITHUB_TOKEN לא מוגדר ב-Vercel: ״סנכרון עכשיו״ כבוי, הסנכרון הלילי ממשיך" };
    case "unreachable":
      return { ...base, level: "yellow", line: "לא הצלחנו לבדוק את המפתח מול GitHub; ננסה שוב בבדיקה הבאה" };
    case "rejected":
      return t.status === 401
        ? { ...base, level: "red", line: "GitHub דוחה את המפתח: פג תוקפו או שבוטל. צרו מפתח חדש והחליפו את GITHUB_TOKEN ב-Vercel" }
        : { ...base, level: "red", line: "למפתח אין הרשאת Actions למאגר COTS-IL. צרו מפתח עם Actions: Read and write" };
    case "valid": {
      if (!t.expiresAt) return { ...base, level: "ok", line: "תקין, בלי תאריך תפוגה" };
      const days = Math.floor((t.expiresAt.getTime() - now.getTime()) / DAY);
      if (days < 0) return { ...base, level: "red", line: `פג תוקף ב-${formatDay(t.expiresAt)}` };
      if (days <= TOKEN_YELLOW_DAYS) return { ...base, level: "yellow", line: `פג תוקף ב-${formatDay(t.expiresAt)}, ${days === 0 ? "היום" : days === 1 ? "מחר" : `בעוד ${days} ימים`}. צרו מפתח חדש לפני כן` };
      return { ...base, level: "ok", line: `תקין עד ${formatDay(t.expiresAt)}` };
    }
  }
}

export function adminsCheck(count: number): HealthCheck {
  const base = { key: "admins", label: "מנהלים", href: HEALTH_LINKS.admins };
  if (count === 0) return { ...base, level: "red", line: "אין אף מנהל" };
  if (count === 1) return { ...base, level: "yellow", line: "רק מנהל אחד. אם הגישה לתיבת המייל הזו תאבד, אין דרך חזרה לניהול בלי מפתח למסד הנתונים. הוסיפו מנהל שני" };
  return { ...base, level: "ok", line: `${count} מנהלים` };
}

const RANK: Record<Level, number> = { red: 0, yellow: 1, ok: 2 };

/** Every check, red first, then yellow, then ok; within a level, in the order below. */
export function healthChecks(input: HealthInput): HealthCheck[] {
  const { now } = input;
  const checks = [
    ...input.suppliers.map((s) => syncCheck(s, now)),
    rateCheck(input.rate, now),
    ...JOBS.map((job) => jobCheck(job, input.jobs[job], now)),
    emailCheck(input.emails),
    githubCheck(input.github, now),
    adminsCheck(input.admins),
  ];
  return checks.map((c, i) => ({ c, i })).sort((a, b) => RANK[a.c.level] - RANK[b.c.level] || a.i - b.i).map(({ c }) => c);
}

export function worstLevel(checks: readonly HealthCheck[]): Level {
  return checks.some((c) => c.level === "red") ? "red" : checks.some((c) => c.level === "yellow") ? "yellow" : "ok";
}

/** What /api/health says: no details, just the state. */
export function publicStatus(checks: readonly HealthCheck[]): "ok" | "warning" | "error" {
  const level = worstLevel(checks);
  return level === "red" ? "error" : level === "yellow" ? "warning" : "ok";
}

/**
 * Suppliers whose prices are too old to show as current: the nightly sync covers them and
 * hasn't succeeded for STALE_PRICE_DAYS (or ever, for one added that long ago).
 */
export function staleSupplierCodes(suppliers: readonly Pick<SupplierSync, "code" | "createdAt" | "lastSuccessAt">[], now: Date, days = STALE_PRICE_DAYS): string[] {
  return suppliers.filter((s) => olderThan(s.lastSuccessAt ?? s.createdAt, now, days * DAY)).map((s) => s.code);
}

/**
 * GitHub's `github-authentication-token-expiration` header, e.g. "2027-01-31 12:00:00 UTC"
 * or "2027-01-31 12:00:00 +0200". Null when absent or unreadable (a token without an expiry).
 */
export function parseTokenExpiration(header: string | null | undefined): Date | null {
  const m = header?.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)\s*(UTC|GMT|Z|[+-]\d{2}:?\d{2})?$/i);
  if (!m) return null;
  const zone = !m[3] || /^(utc|gmt|z)$/i.test(m[3]) ? "Z" : m[3].replace(/^([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}${zone}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whether the watchdog emails now: something is red, and either it's new since the last
 * alert or that alert is ALERT_REPEAT_DAYS old (one email a few days, not one a day, for
 * the same broken thing).
 */
export function shouldAlert(previous: { keys: readonly string[]; at: Date } | null, redKeys: readonly string[], now: Date): boolean {
  if (redKeys.length === 0) return false;
  if (!previous) return true;
  if (redKeys.some((k) => !previous.keys.includes(k))) return true;
  return now.getTime() - previous.at.getTime() >= ALERT_REPEAT_DAYS * DAY - HOUR;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The watchdog's email to the admins: the red lines, then the yellow ones, each with its link. */
export function healthAlertEmail(checks: readonly HealthCheck[], siteUrl: string): { subject: string; html: string; text: string } {
  const red = checks.filter((c) => c.level === "red");
  const yellow = checks.filter((c) => c.level === "yellow");
  const href = (c: HealthCheck) => (c.href.startsWith("http") ? c.href : `${siteUrl}${c.href}`);
  const subject = `COTS-IL: ${red.length === 1 ? "תקלה אחת" : `${red.length} תקלות`} באתר`;
  const item = (c: HealthCheck, color: string) =>
    `<li style="margin:0 0 12px"><strong style="color:${color}">${escapeHtml(c.label)}</strong>: ${escapeHtml(c.line)}${
      c.detail ? `<br><span dir="ltr" style="font-family:monospace;font-size:13px;color:#555">${escapeHtml(c.detail)}</span>` : ""
    }<br><a href="${escapeHtml(href(c))}">לתיקון</a></li>`;
  const html = `<div dir="rtl" style="font-family:-apple-system,'Segoe UI',Arial,sans-serif;font-size:16px;line-height:1.5;color:#111">
<p>הבדיקה היומית של COTS-IL מצאה ${red.length === 1 ? "תקלה" : "תקלות"}:</p>
<ul style="padding-inline-start:20px">${red.map((c) => item(c, "#B00020")).join("")}</ul>
${yellow.length ? `<p>ועוד לבדוק:</p><ul style="padding-inline-start:20px">${yellow.map((c) => item(c, "#8A5300")).join("")}</ul>` : ""}
<p>כל הבדיקות: <a href="${escapeHtml(`${siteUrl}/admin/settings/system`)}">ניהול › הגדרות › מערכת</a></p>
</div>`;
  const line = (c: HealthCheck) => `- ${c.label}: ${c.line}${c.detail ? ` (${c.detail})` : ""}\n  ${href(c)}`;
  const text = [
    "הבדיקה היומית של COTS-IL מצאה תקלות:",
    ...red.map(line),
    ...(yellow.length ? ["", "ועוד לבדוק:", ...yellow.map(line)] : []),
    "",
    `כל הבדיקות: ${siteUrl}/admin/settings/system`,
  ].join("\n");
  return { subject, html, text };
}
