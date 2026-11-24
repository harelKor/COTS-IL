import "server-only";
import { db, schema } from "@/db";
import { morningErrorText, morningSetup, type MorningClientLite, type MorningConfig, type MorningSetup } from "@/domain/morning";

/**
 * A thin Morning (חשבונית ירוקה) client (P2, docs/PAYMENTS-MORNING-PLAN.md). The keys come from
 * MORNING_API_ID / MORNING_API_SECRET / MORNING_ENV and never leave the server; with none set
 * Morning is off and nothing here is called. The token (OAuth client credentials, an hour long)
 * is cached per process and fetched again on a 401. Reads retry 5xx, 429 and network errors with
 * backoff; creating a document never retries blindly (src/lib/morning-documents.ts looks its
 * reference up first).
 */

export const morningSetupNow = (): MorningSetup => morningSetup(process.env);

/** The configuration when Morning is on, else null. */
export function morningConfig(): MorningConfig | null {
  const s = morningSetupNow();
  return s.state === "on" ? s.config : null;
}

export class MorningError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** A timeout, a network error or a 5xx: the request may or may not have happened. */
    readonly uncertain: boolean,
  ) {
    super(message);
    this.name = "MorningError";
  }
}

const TIMEOUT_MS = 15_000;
let cached: { key: string; token: string; expiresAt: number } | null = null;

async function fetchToken(cfg: MorningConfig): Promise<string> {
  let res: Response;
  try {
    res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials", client_id: cfg.id, client_secret: cfg.secret }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new MorningError("אין חיבור לשרת ההזדהות של חשבונית ירוקה", 0, true);
  }
  const body = (await res.json().catch(() => null)) as { access_token?: string; accessToken?: string; expires_in?: number } | null;
  const token = body?.access_token ?? body?.accessToken;
  if (!res.ok || !token) throw new MorningError(`המפתח נדחה: ${morningErrorText(res.status, body)}`, res.status, res.status >= 500);
  cached = { key: `${cfg.env}:${cfg.id}`, token, expiresAt: Date.now() + Math.max(60, (body?.expires_in ?? 3600) - 120) * 1000 };
  return token;
}

async function token(cfg: MorningConfig, fresh = false): Promise<string> {
  if (!fresh && cached && cached.key === `${cfg.env}:${cfg.id}` && cached.expiresAt > Date.now()) return cached.token;
  return fetchToken(cfg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One API call. `retry` (on for reads) repeats 5xx, 429 and network errors up to three times
 * with backoff; a 401 fetches a new token once.
 */
export async function morningCall<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown, opts: { retry?: boolean } = {}): Promise<T> {
  const cfg = morningConfig();
  if (!cfg) throw new MorningError("חשבונית ירוקה לא מחוברת", 0, false);
  const retry = opts.retry ?? method === "GET";
  let refreshed = false;
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${cfg.apiBase}${path}`, {
        method,
        headers: { authorization: `Bearer ${await token(cfg)}`, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      if (error instanceof MorningError) throw error;
      if (retry && attempt < 3) {
        await sleep(500 * 3 ** (attempt - 1));
        continue;
      }
      throw new MorningError("אין תשובה מחשבונית ירוקה (פג הזמן או שאין חיבור)", 0, true);
    }
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      cached = null;
      continue;
    }
    const data = (await res.json().catch(() => null)) as unknown;
    if (res.ok) return data as T;
    const uncertain = res.status >= 500 || res.status === 429;
    if (uncertain && retry && attempt < 3) {
      await sleep(500 * 3 ** (attempt - 1));
      continue;
    }
    throw new MorningError(morningErrorText(res.status, data), res.status, uncertain);
  }
}

/** Records a Morning call's outcome in job_runs (the health list reads the latest). Never throws. */
export async function recordMorning(ok: boolean, detail: Record<string, unknown>) {
  try {
    await db.insert(schema.jobRuns).values({ job: "morning", ok, detail });
  } catch (error) {
    console.error("[morning] could not record", error);
  }
}

export type MorningBusiness = { id: string; name: string; type: number; exemption: boolean };

/** "בדיקת חיבור": the business the keys belong to, as Morning names it. */
export async function testMorningConnection(): Promise<{ ok: true; business: MorningBusiness } | { ok: false; error: string }> {
  try {
    const b = await morningCall<MorningBusiness & { exemption?: boolean }>("GET", "/businesses/me");
    const business = { id: b.id, name: b.name, type: b.type, exemption: !!b.exemption };
    await recordMorning(true, { action: "test", business: business.name });
    return { ok: true, business };
  } catch (error) {
    const message = error instanceof Error ? error.message : "שגיאה";
    await recordMorning(false, { action: "test", error: message });
    return { ok: false, error: message };
  }
}

type ClientSearch = { items: (MorningClientLite & { active?: boolean })[] };

/** Morning clients whose name has any of these words, or this email (for the link suggestions). */
export async function findMorningClients(words: string[], email: string | null): Promise<MorningClientLite[]> {
  const queries = [...new Set(words.filter((w) => w.length > 1))].slice(0, 4).map((name) => ({ name, pageSize: 50 }));
  if (email) queries.push({ email, pageSize: 50 } as never);
  const pages = await Promise.all(queries.map((q) => morningCall<ClientSearch>("POST", "/clients/search", q, { retry: true })));
  const byId = new Map<string, MorningClientLite>();
  for (const p of pages) for (const c of p.items ?? []) if (c.active !== false) byId.set(c.id, { id: c.id, name: c.name, taxId: c.taxId ?? null, emails: c.emails ?? [] });
  return [...byId.values()];
}

export async function getMorningClient(id: string): Promise<MorningClientLite | null> {
  try {
    const c = await morningCall<MorningClientLite>("GET", `/clients/${encodeURIComponent(id)}`);
    return { id: c.id, name: c.name, taxId: c.taxId ?? null, emails: c.emails ?? [] };
  } catch (error) {
    if (error instanceof MorningError && error.status === 404) return null;
    throw error;
  }
}

export async function createMorningClient(body: Record<string, unknown>): Promise<string> {
  const c = await morningCall<{ id: string }>("POST", "/clients", body);
  return c.id;
}

export type MorningDocumentRow = { id: string; number: number | string; remarks?: string | null; type?: number; amount?: number };

/** Documents of a type since a date, newest pages first (for finding a reference after a timeout). */
export async function searchMorningDocuments(type: number, fromDate: string): Promise<MorningDocumentRow[]> {
  const out: MorningDocumentRow[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await morningCall<{ items?: MorningDocumentRow[]; pages?: number }>(
      "POST",
      "/documents/search",
      { type: [type], fromDate, page, pageSize: 100 },
      { retry: true },
    );
    out.push(...(res.items ?? []));
    if (!res.pages || page >= res.pages) break;
  }
  return out;
}

export type CreatedDocument = { id: string; number: number | string; url?: { he?: string; en?: string; origin?: string } };

/** Issues a document. Never retried here: a timeout is answered by looking the reference up. */
export async function createMorningDocument(payload: unknown): Promise<CreatedDocument> {
  return morningCall<CreatedDocument>("POST", "/documents", payload, { retry: false });
}

export async function morningDownloadLinks(morningId: string): Promise<{ he?: string; en?: string; origin?: string }> {
  return morningCall("GET", `/documents/${encodeURIComponent(morningId)}/download/links`);
}
