import { type NextRequest } from "next/server";
import { hasBearer } from "@/lib/bearer";
import { recordJob } from "@/lib/health";
import { runDailyNotifications } from "@/lib/notify";

export const maxDuration = 60;

/**
 * The daily email job (S3): one reminder per quote waiting more than three days, and the
 * admin's digest of requests without a quote after a day. The catalog sync workflow
 * (.github/workflows/sync.yml) calls it with the REVALIDATE_SECRET. Does nothing while
 * email is off. Its outcome goes to job_runs for the health list (M1).
 */
export async function POST(request: NextRequest) {
  if (!hasBearer(request.headers.get("authorization"), process.env.REVALIDATE_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runDailyNotifications();
    await recordJob("daily_digest", true, { result });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : String(error);
    console.error("[notify] daily job failed", error);
    await recordJob("daily_digest", false, { error: message });
    return Response.json({ error: "daily job failed" }, { status: 500 });
  }
}
