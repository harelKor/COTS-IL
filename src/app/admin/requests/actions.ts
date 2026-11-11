"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";

const input = z.object({ id: z.uuid(), handled: z.enum(["1", "0"]) });

/** Marks a part request as handled, or opens it again (the same button undoes it). */
export async function setPartRequestHandled(formData: FormData) {
  await requireAdmin();
  const parsed = input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, handled } = parsed.data;
  await db
    .update(schema.partRequests)
    .set({ handledAt: handled === "1" ? new Date() : null })
    .where(eq(schema.partRequests.id, id));
  revalidatePath("/admin/requests");
}
