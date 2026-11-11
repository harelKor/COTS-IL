"use server";

import { and, count, eq, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { parsePartRequest } from "@/domain/part-request";
import { getViewer, orderingTeam } from "@/lib/auth";
import { BOT_ERROR, isBot } from "@/lib/botid";

export type PartRequestState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; error: string }
  | { status: "signed-out" };

/** Requests one person may send a day, so the form can't flood the admin. */
const DAILY_LIMIT = 10;

/**
 * "לא מצאתם? שלחו לנו קישור לחלק": a signed-in team sends one link and a note for
 * a part the catalog doesn't have. It waits on the admin's "בקשות חלקים" page.
 */
export async function requestPart(
  _prev: PartRequestState,
  formData: FormData,
): Promise<PartRequestState> {
  if (await isBot()) return { status: "error", error: BOT_ERROR };
  const viewer = await getViewer();
  if (!viewer) return { status: "signed-out" };
  const parsed = parsePartRequest({
    url: String(formData.get("url") ?? ""),
    note: String(formData.get("note") ?? ""),
    query: String(formData.get("query") ?? ""),
  });
  if (!parsed.ok) return { status: "error", error: parsed.error };

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ sent }] = await db
    .select({ sent: count() })
    .from(schema.partRequests)
    .where(
      and(
        eq(schema.partRequests.userId, viewer.id),
        gt(schema.partRequests.createdAt, since),
      ),
    );
  if (sent >= DAILY_LIMIT)
    return {
      status: "error",
      error: "שלחתם הרבה בקשות היום. נחזור אליכם עליהן, ואפשר לשלוח עוד מחר.",
    };

  await db
    .insert(schema.partRequests)
    .values({
      ...parsed.value,
      userId: viewer.id,
      teamId: orderingTeam(viewer)?.id ?? null,
    });
  revalidatePath("/admin/requests");
  return { status: "sent" };
}
