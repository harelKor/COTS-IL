"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { moveId, newGroupId, type CategoryGroup } from "@/domain/category-groups";
import { contentSchema } from "@/domain/settings";
import { requireAdmin } from "@/lib/auth";
import { currentSettings, writeSettings } from "@/lib/settings-write";
import type { SettingsResult } from "../actions";

/**
 * קטגוריות (S16d): names, order, groups, the home photo and hiding. Every change checks the
 * admin, writes audit_log and expires `catalog` (and `settings` for groups), so the home page,
 * the stores and the catalog show it without a deploy. Nothing here regroups: families point
 * at categories by id, and the names are read at render.
 */

const PATH = "/admin/settings/categories";
const { categories } = schema;

export type CategorySnapshot = { id: string; name: string; groupId: string; hidden: boolean; homeImage: string | null; sortOrder: number };
export type CategoryResult = { ok: true; message: string; before: CategorySnapshot[] } | { ok: false; error: string };

function refresh() {
  updateTag("catalog");
  revalidatePath("/", "layout");
  revalidatePath(PATH);
}

async function snapshot(): Promise<CategorySnapshot[]> {
  return db
    .select({ id: categories.id, name: categories.name, groupId: categories.groupId, hidden: categories.hidden, homeImage: categories.homeImage, sortOrder: categories.sortOrder })
    .from(categories)
    .orderBy(asc(categories.sortOrder));
}

async function write(actorId: string, action: string, before: CategorySnapshot[], after: CategorySnapshot[]) {
  const changed = after.filter((a) => JSON.stringify(a) !== JSON.stringify(before.find((b) => b.id === a.id)));
  if (changed.length === 0) return;
  await db.transaction(async (tx) => {
    for (const c of changed) {
      await tx
        .update(categories)
        .set({ name: c.name, groupId: c.groupId, hidden: c.hidden, homeImage: c.homeImage, sortOrder: c.sortOrder })
        .where(eq(categories.id, c.id));
    }
    await tx.insert(schema.auditLog).values({
      actorId,
      entity: "categories",
      entityId: changed.length === 1 ? changed[0].id : "*",
      action,
      before: before.filter((b) => changed.some((c) => c.id === b.id)),
      after: changed,
    });
  });
  refresh();
}

const categoryInput = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60),
  groupId: z.string().regex(/^[a-z0-9-]{1,30}$/),
  hidden: z.literal("on").optional(),
  homeImage: z.union([z.literal(""), z.url({ protocol: /^https$/ }).max(500)]),
});

/** Saves one category's name, group, photo and hidden switch. */
export async function saveCategory(formData: FormData): Promise<CategoryResult> {
  const viewer = await requireAdmin();
  const parsed = categoryInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "לא תקין: שם (עד 60 תווים) או קישור התמונה (https)" };
  const { id, name, groupId, hidden, homeImage } = parsed.data;
  const { content } = await currentSettings();
  if (!content.categoryGroups.some((g) => g.id === groupId)) return { ok: false, error: "הקבוצה לא קיימת" };
  const before = await snapshot();
  const current = before.find((c) => c.id === id);
  if (!current) return { ok: false, error: "הקטגוריה לא נמצאה" };
  const after = before.map((c) => (c.id === id ? { ...c, name, groupId, hidden: hidden === "on", homeImage: homeImage || null } : c));
  await write(viewer.id, "update_category", before, after);
  return { ok: true, message: `״${name}״ נשמרה`, before };
}

/** Moves a category one place up or down in every list. */
export async function moveCategory(id: string, by: -1 | 1): Promise<CategoryResult> {
  const viewer = await requireAdmin();
  const before = await snapshot();
  const order = moveId(
    before.map((c) => c.id),
    id,
    by,
  );
  const after = before.map((c) => ({ ...c, sortOrder: (order.indexOf(c.id) + 1) * 10 }));
  await write(viewer.id, "move_category", before, after);
  return { ok: true, message: "הסדר עודכן", before };
}

const snapshotInput = z.array(
  z.object({
    id: z.uuid(),
    name: z.string().min(1).max(60),
    groupId: z.string().regex(/^[a-z0-9-]{1,30}$/),
    hidden: z.boolean(),
    homeImage: z.string().max(500).nullable(),
    sortOrder: z.number().int(),
  }),
);

/** Undo: puts the categories back as they were before a change. */
export async function restoreCategories(rows: CategorySnapshot[]): Promise<SettingsResult> {
  const viewer = await requireAdmin();
  const parsed = snapshotInput.safeParse(rows);
  if (!parsed.success) return { ok: false, error: "לא הצלחנו לבטל" };
  const before = await snapshot();
  const after = before.map((c) => parsed.data.find((r) => r.id === c.id) ?? c);
  await write(viewer.id, "restore_categories", before, after);
  return { ok: true, message: "בוטל" };
}

export type GroupsResult = { ok: true; message: string; before: CategoryGroup[] } | { ok: false; error: string };

/**
 * Saves the groups' names and order. A group the admin removed takes its categories to
 * the last group (groupOf), so nothing disappears; new groups get an id here.
 */
export async function saveGroups(groups: { id: string | null; name: string }[]): Promise<GroupsResult> {
  const viewer = await requireAdmin();
  const settings = await currentSettings();
  const taken = settings.content.categoryGroups.map((g) => g.id);
  const withIds = groups.map((g) => {
    if (g.id) return { id: g.id, name: g.name };
    const id = newGroupId(taken);
    taken.push(id);
    return { id, name: g.name };
  });
  const parsed = contentSchema.shape.categoryGroups.safeParse(withIds);
  if (!parsed.success) return { ok: false, error: "צריך לפחות קבוצה אחת, ולכל קבוצה שם (עד 40 תווים)" };
  await writeSettings(viewer.id, "update_category_groups", settings, { ...settings, content: { ...settings.content, categoryGroups: parsed.data } });
  refresh();
  return { ok: true, message: "הקבוצות נשמרו", before: settings.content.categoryGroups };
}
