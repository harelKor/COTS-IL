import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canDecideQuote, quoteContentHash, teamCanOrder } from "@/domain/orders";
import { createQuoteLinkToken, quoteLinkExpiresAt, readQuoteLinkToken, readSignedQuoteLinkToken } from "@/domain/quote-link";
import { getBusiness } from "@/lib/settings";
import { siteUrl } from "@/lib/site-url";

const { memberships, profiles, quoteLines, quotes, teamOrders, teams } = schema;

const secret = () => process.env.QUOTE_LINK_SECRET;

/** An Israeli number ("050-123-4567") as WhatsApp wants it ("972501234567"). */
export function whatsappNumber(phone: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 9) return null;
  if (digits.startsWith("972")) return digits;
  return digits.startsWith("0") ? `972${digits.slice(1)}` : digits;
}

async function hashOf(quote: { id: string; orderId: string; version: number; shippingIls: number }) {
  const lines = await db.select().from(quoteLines).where(eq(quoteLines.quoteId, quote.id));
  return quoteContentHash({ orderId: quote.orderId, version: quote.version, shippingIls: quote.shippingIls, lines });
}

/**
 * For the admin's order page: one approval link per sign-in email of the team (D11:
 * every email on the account can approve), for the
 * quote waiting for approval. Null when nothing waits, or when QUOTE_LINK_SECRET
 * isn't set (then links can't be made, and the page says so).
 */
export async function getApproveLinks(orderId: string) {
  const key = secret();
  const [quote] = await db.select().from(quotes).where(eq(quotes.orderId, orderId)).orderBy(desc(quotes.version)).limit(1);
  const [order] = await db.select().from(teamOrders).where(eq(teamOrders.id, orderId));
  if (!quote || !order || quote.status !== "sent" || !canDecideQuote(order.status)) return null;
  if (!key || key.length < 16) return { missingSecret: true as const, members: [] };

  const contentHash = await hashOf(quote);
  const members = await db
    .select({ userId: profiles.id, name: profiles.fullName, email: profiles.email, phone: profiles.phone })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(eq(memberships.teamId, order.teamId))
    .orderBy(asc(memberships.createdAt));
  const [team] = await db.select().from(teams).where(eq(teams.id, order.teamId));
  const expiresAt = quoteLinkExpiresAt((await getBusiness()).quoteValidDays);

  return {
    missingSecret: false as const,
    members: members.map((m) => {
      const url = `${siteUrl()}/q/${createQuoteLinkToken({ quoteId: quote.id, userId: m.userId, contentHash, expiresAt }, key)}`;
      // Someone who signed up with an email link has no phone on the profile; the order has one.
      const phone = whatsappNumber(m.phone ?? order.contactPhone ?? team?.contactPhone ?? null);
      const text = `שלום${m.name ? ` ${m.name}` : ""}, הצעת המחיר להזמנה ${order.number} מוכנה. לאישור בלחיצה: ${url}`;
      return { userId: m.userId, name: m.name, email: m.email, url, whatsappUrl: `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(text)}` };
    }),
  };
}

/**
 * What an approval link points at, checked: a real token, the quote still the
 * one waiting for approval and unchanged, and the person it was made for still on the team.
 */
export async function readApproveLink(token: string) {
  const claims = readQuoteLinkToken(token, secret());
  if (!claims) {
    // An expired link still names its quote, so it can ask for a new one and point at the order.
    const signed = readSignedQuoteLinkToken(token, secret());
    const [old] = signed ? await db.select({ orderId: quotes.orderId }).from(quotes).where(eq(quotes.id, signed.quoteId)) : [];
    const [order] = old ? await db.select().from(teamOrders).where(eq(teamOrders.id, old.orderId)) : [];
    if (!signed) return { ok: false as const, reason: "הקישור אינו תקף." };
    // A genuine link to a quote that no longer exists: its order was deleted.
    if (!order) return { ok: false as const, gone: true as const, reason: "הקישור אינו תקף." };
    return {
      ok: false as const,
      expired: true as const,
      reason: `תוקף הקישור פג ב-${new Date(signed.expiresAt).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}.`,
      orderId: order.id,
      orderNumber: order.number,
    };
  }
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, claims.quoteId));
  // The order was deleted (with its quotes): the link 404s.
  if (!quote) return { ok: false as const, gone: true as const, reason: "ההצעה לא נמצאה." };
  const [order] = await db.select().from(teamOrders).where(eq(teamOrders.id, quote.orderId));
  const [team] = await db.select().from(teams).where(eq(teams.id, order.teamId));
  const [member] = await db
    .select({ name: profiles.fullName, email: profiles.email })
    .from(memberships)
    .innerJoin(profiles, eq(profiles.id, memberships.userId))
    .where(and(eq(memberships.teamId, order.teamId), eq(memberships.userId, claims.userId)));
  const base = { orderId: order.id, orderNumber: order.number, quoteId: quote.id };

  if (quote.status === "approved") return { ok: false as const, reason: "ההצעה אושרה. הספק הישראלי יזמין מהספקים ויעדכן אתכם.", ...base };
  if (quote.status !== "sent" || !canDecideQuote(order.status)) return { ok: false as const, reason: "ההצעה הזאת כבר לא בתוקף, ונשלחה גרסה חדשה.", ...base };
  if ((await hashOf(quote)) !== claims.contentHash) return { ok: false as const, reason: "ההצעה השתנתה מאז שנשלח הקישור.", ...base };
  if (!member || !team || !teamCanOrder(team.status)) return { ok: false as const, reason: "הכתובת שהקישור נשלח אליה כבר לא בחשבון הקבוצה.", ...base };

  return { ok: true as const, claims, quote, team, member: member.name ?? member.email, ...base };
}
