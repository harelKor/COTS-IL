import type { NotifyEvent } from "@/domain/notifications";
import type { EmailData } from "./email-templates";

/**
 * One made-up example of each email's data, for the template editor's preview and test send (M6).
 * An event with no sample here still takes an override; its preview says there is no example.
 */
const site = "https://cots-il.vercel.app";
const team = "אורביט FRC 1690";

const lines = [
  { title: 'Steel Spur Gear 20DP 1/2" Hex', sku: "WCP-0749", options: "40T", qty: 2, unitPriceIls: 120 },
  { title: "Kraken X60 Motor", sku: null, options: null, qty: 1, unitPriceIls: 900 },
];

export const EMAIL_SAMPLES: { [E in keyof EmailData]: EmailData[E] } = {
  request_received: { orderNumber: 1071, teamName: team, lines, totalIls: 1140, quoteDays: 2, orderUrl: `${site}/orders/x`, adminUrl: `${site}/admin?open=x` },
  team_signed_up: { teamName: team, contactName: "דנה", email: "team@example.com", adminUrl: `${site}/admin/teams` },
  join_request: { teamName: team, email: "new@example.com", name: null, teamUrl: `${site}/team`, adminUrl: `${site}/admin/teams` },
  quote_ready: { orderNumber: 1071, teamName: team, totalIls: 1240, approveUrl: `${site}/q/abc.def`, orderUrl: `${site}/orders/x`, linkDays: 14 },
  quote_approved: { orderNumber: 1071, teamName: team, totalIls: 1240, adminUrl: `${site}/admin?open=x` },
  quote_rejected: { orderNumber: 1071, teamName: team, reason: "יקר מדי", adminUrl: `${site}/admin?open=x` },
  order_cancelled: { orderNumber: 1071, teamName: team, adminUrl: `${site}/admin?open=x` },
  change_requested: { orderNumber: 1071, teamName: team, reason: "בלי הגיר", adminUrl: `${site}/admin?open=x` },
  link_requested: { orderNumber: 1071, teamName: team, email: "team@example.org", adminUrl: `${site}/admin?open=x` },
  invite: { teamName: team, url: `${site}/invite/abc`, days: 14 },
  stage: { orderNumber: 1071, teamName: team, stage: "ready", pickup: true, orderUrl: `${site}/orders/x` },
  quote_reminder: { orderNumber: 1071, teamName: team, days: 4, approveUrl: null, orderUrl: `${site}/orders/x` },
  admin_digest: { items: [{ orderNumber: 1072, teamName: "סייבר FTC 12345", hours: 30, url: `${site}/admin?open=y` }], adminUrl: `${site}/admin` },
};

/** The sample for an event, or null when none was written (an event added after this list). */
export function sampleFor(event: NotifyEvent): EmailData[NotifyEvent] | null {
  return (EMAIL_SAMPLES as Partial<Record<NotifyEvent, EmailData[NotifyEvent]>>)[event] ?? null;
}
