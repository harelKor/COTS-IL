import "server-only";
import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema } from "@/db";
import { contentSchema, parseSettings, type Content, type Settings } from "@/domain/settings";

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


/**
 * Changes part of the site content (תוכן האתר) for the actions of the messages and content pages: the
 * `part` is merged over the stored content, checked, written with its audit_log row, and returned
 * with what it replaced, for the Undo toast.
 */
export async function updateContent(
  actorId: string,
  action: string,
  part: (content: Content) => Partial<Content>,
): Promise<{ ok: true; before: Partial<Content> } | { ok: false }> {
  const settings = await currentSettings();
  const changed = part(settings.content);
  const content = contentSchema.safeParse({ ...settings.content, ...changed });
  if (!content.success) return { ok: false };
  const before = Object.fromEntries(Object.keys(changed).map((k) => [k, settings.content[k as keyof Content]])) as Partial<Content>;
  await writeSettings(actorId, action, settings, { ...settings, content: content.data });
  return { ok: true, before };
}
