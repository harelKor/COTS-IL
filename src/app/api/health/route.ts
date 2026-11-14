import { connection } from "next/server";
import { publicStatus } from "@/domain/health";
import { getHealth } from "@/lib/health";

/**
 * For an outside uptime monitor (M1): `{"status":"ok"|"warning"|"error"}` and nothing else, no
 * details and no secrets. 200 while the app and its database answer, whatever the status
 * (match the word "error" for alerts on red); 503 when the database doesn't answer.
 */
export async function GET() {
  await connection();
  const headers = { "Cache-Control": "no-store" };
  try {
    const { checks } = await getHealth();
    return Response.json({ status: publicStatus(checks) }, { headers });
  } catch {
    return Response.json({ status: "down" }, { status: 503, headers });
  }
}
