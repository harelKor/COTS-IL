import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { getViewer } from "@/lib/auth";
import { morningConfig, morningDownloadLinks } from "@/lib/morning";

/**
 * A Morning document's PDF for the team (P3): only someone on the order's team, or the admin,
 * gets it. The link is asked from Morning fresh when it is connected (its links may expire),
 * else the one stored when the document was issued. ?lang=en for the English copy.
 */
export async function GET(request: Request, { params }: RouteContext<"/orders/[id]/documents/[docId]">) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { id, docId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(docId).success) notFound();
  const [doc] = await db
    .select()
    .from(schema.billingDocuments)
    .where(and(eq(schema.billingDocuments.id, docId), eq(schema.billingDocuments.orderId, id), eq(schema.billingDocuments.status, "issued")));
  if (!doc || (!viewer.isAdmin && !viewer.teams.some((t) => t.id === doc.teamId))) notFound();

  const english = new URL(request.url).searchParams.get("lang") === "en";
  let url = english ? doc.pdfUrlEn : doc.pdfUrlHe;
  const cfg = morningConfig();
  if (cfg && doc.morningId && doc.env === cfg.env) {
    const links = await morningDownloadLinks(doc.morningId).catch(() => null);
    url = (english ? links?.en : links?.he ?? links?.origin) ?? url;
  }
  if (!url || !/^https:\/\//.test(url)) notFound();
  redirect(url);
}
