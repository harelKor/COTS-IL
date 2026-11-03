"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";

const reviewSchema = z.object({
  teamId: z.uuid(),
  decision: z.enum(["active", "rejected"]),
  reason: z.string().trim().max(500).optional(),
});

/** Approve or reject a team's registration, recording the change in the audit log. */
export async function reviewTeam(formData: FormData) {
  const admin = await requireAdmin();
  const { teamId, decision, reason } = reviewSchema.parse(Object.fromEntries(formData));

  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.teams).where(eq(schema.teams.id, teamId)).for("update");
    if (!before) throw new Error("Team not found");

    const [after] = await tx
      .update(schema.teams)
      .set({
        status: decision,
        reviewedAt: new Date(),
        reviewedBy: admin.id,
        rejectionReason: decision === "rejected" ? reason || null : null,
      })
      .where(eq(schema.teams.id, teamId))
      .returning();

    await tx.insert(schema.auditLog).values({
      actorId: admin.id,
      entity: "team",
      entityId: teamId,
      action: decision === "active" ? "approve" : "reject",
      before: { status: before.status, rejectionReason: before.rejectionReason },
      after: { status: after.status, rejectionReason: after.rejectionReason },
    });
  });

  revalidatePath("/admin");
}
