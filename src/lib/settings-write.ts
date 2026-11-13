import "server-only";
import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema } from "@/db";
import { parseSettings, type Settings } from "@/domain/settings";

/** The stored settings, read past the cache (for a save that changes one section). */
export async function currentSettings(): Promise<Settings> {
  const [row] = await db.select({ data: schema.siteSettings.data }).from(schema.siteSettings).where(eq(schema.siteSettings.id, 1));
  return parseSettings(row?.data);
}

/** Writes the settings and their audit_log row in one transaction, then expires `settings`. */
export async function writeSettings(actorId: string, action: string, before: Settings, after: Settings) {
  await db.transaction(async (tx) => {
    await tx
      .insert(schema.siteSettings)
      .values({ id: 1, data: after, updatedBy: actorId })
      .onConflictDoUpdate({ target: schema.siteSettings.id, set: { data: after, updatedAt: new Date(), updatedBy: actorId } });
    await tx.insert(schema.auditLog).values({ actorId, entity: "site_settings", entityId: "1", action, before, after });
  });
  updateTag("settings");
}

