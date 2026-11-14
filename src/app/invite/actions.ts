"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { getViewer } from "@/lib/auth";
import { acceptInvitationsForUser, BLOCKED_EMAIL_ERROR, findInvitation, isEmailBlocked } from "@/lib/invitations";

/** Joins as the signed-in user, whose address has to be the invited one. */
export async function joinInvited(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const found = await findInvitation(String(formData.get("token") ?? ""));
  if (!found || found.invitation.acceptedAt) return { error: "ההזמנה כבר לא בתוקף" };
  if (found.invitation.email !== viewer.email.toLowerCase()) return { error: "ההזמנה נשלחה לכתובת דוא״ל אחרת" };
  if (await isEmailBlocked(viewer.email)) return { error: BLOCKED_EMAIL_ERROR };

  await acceptInvitationsForUser(viewer.id, viewer.email);
  revalidatePath("/", "layout");
  redirect("/team");
}
