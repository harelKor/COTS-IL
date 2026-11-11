import { type NextRequest } from "next/server";
import { hasBearer } from "@/lib/bearer";
import { runDailyNotifications } from "@/lib/notify";

export const maxDuration = 60;

/**
 * The daily email job (S3): one reminder per quote waiting more than three days, and the
 * admin's digest of requests without a quote after a day. The catalog sync workflow
 * (.github/workflows/sync.yml) calls it with the REVALIDATE_SECRET. Does nothing while
 * email is off.
 */
export async function POST(request: NextRequest) {
  if (!hasBearer(request.headers.get("authorization"), process.env.REVALIDATE_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await runDailyNotifications());
}
