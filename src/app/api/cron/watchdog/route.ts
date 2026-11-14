import { and, desc, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { type NextRequest } from "next/server";
import { db, schema } from "@/db";
import { healthAlertEmail, shouldAlert } from "@/domain/health";
import { hasBearer } from "@/lib/bearer";
import { deliver, resendTransport } from "@/lib/email-transport";
import { getHealthFresh, recordJob } from "@/lib/health";
import { siteUrl } from "@/lib/site-url";

export const maxDuration = 60;

type WatchdogDetail = { red?: string[]; stale?: string[]; emailed?: boolean };

/**
 * The daily watchdog (M1), run by Vercel Cron (vercel.json) so it keeps working when GitHub
 * Actions stops. It runs the health list with a fresh GitHub key check and emails the admins
 * when something is red: at once for a new red, then every few days while it stays red
 * (shouldAlert). With email off it only logs what it would send; the admin banner still shows it.
 * When the suppliers whose prices are too old change, it refreshes the catalog so their parts
 * show "המחיר ייבדק בהצעה". Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  if (!hasBearer(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const now = new Date();
    const { checks, staleSuppliers } = await getHealthFresh();
    const red = checks.filter((c) => c.level === "red");
    const redKeys = red.map((c) => c.key);

    const runs = schema.jobRuns;
    const [[lastRun], [lastAlert]] = await Promise.all([
      db.select().from(runs).where(and(eq(runs.job, "watchdog"), eq(runs.ok, true))).orderBy(desc(runs.at)).limit(1),
      db.select().from(runs).where(and(eq(runs.job, "watchdog"), sql`(${runs.detail}->>'emailed')::boolean`)).orderBy(desc(runs.at)).limit(1),
    ]);

    const previousStale = ((lastRun?.detail as WatchdogDetail | null)?.stale ?? []).slice().sort().join(",");
    if (previousStale !== staleSuppliers.slice().sort().join(",")) revalidateTag("catalog", "max");

    const previous = lastAlert ? { keys: (lastAlert.detail as WatchdogDetail).red ?? [], at: lastAlert.at } : null;
    let emailed = 0;
    let failed = 0;
    if (shouldAlert(previous, redKeys, now)) {
      const email = healthAlertEmail(checks, siteUrl());
      const transport = resendTransport();
      if (!transport) {
        console.info(`[watchdog] email is off (RESEND_API_KEY or EMAIL_FROM missing); would email the admins: ${email.subject}\n${email.text}`);
      } else {
        const admins = await db.select({ userId: schema.profiles.id, email: schema.profiles.email }).from(schema.profiles).where(eq(schema.profiles.isAdmin, true));
        const results = await deliver(
          admins.map((a) => ({ ...a, audience: "admin" as const })),
          () => email,
          transport,
        );
        if (results.length > 0) {
          await db.insert(schema.auditLog).values(
            results.map((r) => ({
              actorId: null,
              entity: "site",
              entityId: "health",
              action: "email:health_alert",
              after: { to: r.recipient.email, audience: "admin", subject: r.subject, ok: r.ok, providerId: r.providerId, error: r.error, red: redKeys },
            })),
          );
        }
        emailed = results.filter((r) => r.ok).length;
        failed = results.length - emailed;
        for (const r of results) if (!r.ok) console.error(`[watchdog] alert to ${r.recipient.email} failed: ${r.error}`);
      }
    }

    await recordJob("watchdog", true, { red: redKeys, stale: staleSuppliers, emailed: emailed > 0, ...(failed ? { failed } : {}) });
    return Response.json({ red: red.length, yellow: checks.filter((c) => c.level === "yellow").length, emailed, stale: staleSuppliers.length });
  } catch (error) {
    console.error("[watchdog] failed", error);
    await recordJob("watchdog", false, { error: error instanceof Error ? error.message.slice(0, 300) : String(error) });
    return Response.json({ error: "watchdog failed" }, { status: 500 });
  }
}
