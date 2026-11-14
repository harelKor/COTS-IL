import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { db, schema } from "@/db";
import {
  JOBS,
  healthChecks,
  parseTokenExpiration,
  staleSupplierCodes,
  type HealthCheck,
  type HealthInput,
  type Job,
  type JobHistory,
  type SupplierSync,
  type TokenStatus,
} from "@/domain/health";
import { emailConfig } from "@/domain/notifications";
import { getSettings } from "@/lib/settings";
import { GITHUB_REPO } from "@/lib/supplier-admin";

/**
 * Gathers the health list's input (src/domain/health.ts): a handful of small queries, plus the
 * GitHub key check, which is cached for hours so admin pages don't call GitHub on every view.
 */

type SyncRow = {
  code: string;
  name: string;
  platform: string;
  created_at: Date | string;
  last_success: Date | string | null;
  last_full: Date | string | null;
  status: "running" | "succeeded" | "failed" | null;
  started_at: Date | string | null;
  error: string | null;
};

const toDate = (v: Date | string | null): Date | null => (v === null ? null : v instanceof Date ? v : new Date(v));

/** The suppliers the nightly sync covers, with their last success and latest run. */
async function supplierSyncs(): Promise<SupplierSync[]> {
  const { rows } = await db.execute<SyncRow>(sql`
    SELECT s.code, s.name, s.platform, s.created_at,
           (SELECT max(j.finished_at) FROM ${schema.syncJobs} j WHERE j.supplier_id = s.id AND j.status = 'succeeded') AS last_success,
           (SELECT max(j.finished_at) FROM ${schema.syncJobs} j WHERE j.supplier_id = s.id AND j.status = 'succeeded'
              AND coalesce(j.counts->>'mode', 'full') = 'full') AS last_full,
           l.status, l.started_at, l.error
      FROM ${schema.suppliers} s
      LEFT JOIN LATERAL (
        SELECT j.status, j.started_at, j.error FROM ${schema.syncJobs} j WHERE j.supplier_id = s.id ORDER BY j.started_at DESC LIMIT 1
      ) l ON true
     WHERE s.active AND s.sync_enabled AND s.platform <> 'manual'
     ORDER BY s.name`);
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    platform: r.platform,
    createdAt: toDate(r.created_at)!,
    lastSuccessAt: toDate(r.last_success),
    lastFullSuccessAt: toDate(r.last_full),
    latest: r.status && r.started_at ? { status: r.status, startedAt: toDate(r.started_at)!, error: r.error } : null,
  }));
}

async function jobHistories(): Promise<Record<Job, JobHistory>> {
  const { rows } = await db.execute<{ job: string; last_ok: boolean; last_at: Date | string; last_success: Date | string | null }>(sql`
    SELECT job, (array_agg(ok ORDER BY at DESC))[1] AS last_ok, max(at) AS last_at, max(at) FILTER (WHERE ok) AS last_success
      FROM ${schema.jobRuns} GROUP BY job`);
  const out = Object.fromEntries(JOBS.map((j) => [j, { lastRun: null, lastSuccessAt: null }])) as Record<Job, JobHistory>;
  for (const r of rows) {
    if (!(JOBS as readonly string[]).includes(r.job)) continue;
    out[r.job as Job] = { lastRun: { ok: r.last_ok, at: toDate(r.last_at)! }, lastSuccessAt: toDate(r.last_success) };
  }
  return out;
}

async function emailStats(): Promise<Omit<HealthInput["emails"], "on">> {
  const {
    rows: [r],
  } = await db.execute<{ sent: number; failed: number; last_failed: boolean | null }>(sql`
    SELECT count(*) FILTER (WHERE (a.after->>'ok')::boolean IS TRUE)::int AS sent,
           count(*) FILTER (WHERE (a.after->>'ok')::boolean IS NOT TRUE)::int AS failed,
           (SELECT (b.after->>'ok')::boolean IS NOT TRUE FROM ${schema.auditLog} b
             WHERE b.action LIKE 'email:%' ORDER BY b.at DESC LIMIT 1) AS last_failed
      FROM ${schema.auditLog} a
     WHERE a.action LIKE 'email:%' AND a.at > now() - interval '7 days'`);
  return { sent7d: r?.sent ?? 0, failed7d: r?.failed ?? 0, lastFailed: r?.last_failed === true && (r?.failed ?? 0) > 0 };
}

async function latestRate(): Promise<HealthInput["rate"]> {
  const [{ rows }, settings] = await Promise.all([
    db.execute<{ rate_date: string | Date | null }>(sql`SELECT max(rate_date)::text AS rate_date FROM ${schema.exchangeRates} WHERE currency = 'USD'`),
    getSettings(),
  ]);
  const date = rows[0]?.rate_date;
  if (!date) return settings.pricing.rateOverride ? { rateDate: "1970-01-01", manual: true } : null;
  return { rateDate: String(date).slice(0, 10), manual: !!settings.pricing.rateOverride };
}

async function adminCount(): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${schema.profiles} WHERE is_admin`);
  return rows[0]?.n ?? 0;
}

/** Asks GitHub whether the key can still run the sync workflow, and when it expires. */
export async function checkGithubToken(): Promise<TokenStatus> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { state: "missing" };
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/sync.yml`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (res.ok) return { state: "valid", expiresAt: parseTokenExpiration(res.headers.get("github-authentication-token-expiration")) };
    // GitHub answers 403 when rate limited, too: that says nothing about the key.
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") return { state: "unreachable" };
    if (res.status === 401 || res.status === 403 || res.status === 404) return { state: "rejected", status: res.status };
    return { state: "unreachable" };
  } catch {
    return { state: "unreachable" };
  }
}

type CachedToken = { state: "missing" } | { state: "unreachable" } | { state: "rejected"; status: number } | { state: "valid"; expiresAt: string | null };

/** Six hours per key (a new key, a new fingerprint, a fresh check); the watchdog checks uncached. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- only the cache key
async function cachedGithubToken(_fingerprint: string): Promise<CachedToken> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 6 * 3600, expire: 24 * 3600 });
  cacheTag("health");
  const t = await checkGithubToken();
  return t.state === "valid" ? { state: "valid", expiresAt: t.expiresAt?.toISOString() ?? null } : t;
}

async function githubToken(fresh: boolean): Promise<TokenStatus> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { state: "missing" };
  if (fresh) return checkGithubToken();
  const t = await cachedGithubToken(createHash("sha256").update(token).digest("hex").slice(0, 16));
  return t.state === "valid" ? { state: "valid", expiresAt: t.expiresAt ? new Date(t.expiresAt) : null } : t;
}

export type Health = { checks: HealthCheck[]; staleSuppliers: string[] };

async function gather(fresh: boolean): Promise<Health> {
  const [suppliers, rate, jobs, emails, github, admins] = await Promise.all([
    supplierSyncs(),
    latestRate(),
    jobHistories(),
    emailStats(),
    githubToken(fresh),
    adminCount(),
  ]);
  const now = new Date();
  const input: HealthInput = { now, suppliers, rate, jobs, emails: { on: emailConfig(process.env) !== null, ...emails }, github, admins };
  return { checks: healthChecks(input), staleSuppliers: staleSupplierCodes(suppliers, now) };
}

/** The health list for this request (the banner and the system card share one read). */
export const getHealth = cache(() => gather(false));

/** For the watchdog: the GitHub key checked now, not from the cache. */
export const getHealthFresh = () => gather(true);

/**
 * Suppliers whose parts show "המחיר ייבדק בהצעה" (STALE_PRICE_DAYS without a successful sync).
 * Cached with the catalog: the sync's revalidate, or the watchdog when the list changes, refreshes it.
 */
export async function getStaleSupplierCodes(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  return staleSupplierCodes(await supplierSyncs(), new Date());
}

/** Records a job's outcome in job_runs. Never throws: a report that can't be written must not fail the job. */
export async function recordJob(job: Job, ok: boolean, detail?: Record<string, unknown>) {
  try {
    await db.insert(schema.jobRuns).values({ job, ok, detail: detail ?? null });
  } catch (error) {
    console.error(`[health] could not record ${job}`, error);
  }
}
