import { statusLabel } from "@/domain/order-status";
import { describe, expect, it } from "vitest";
import { recipientsFor, type Recipient } from "@/domain/notifications";
import { renderEmail, type EmailData } from "./email-templates";
import { deliver, resendTransport, type OutgoingEmail } from "./email-transport";

const site = "https://cots-il.vercel.app";
const lines = [
  { title: 'Steel Spur Gear 20DP 1/2" Hex', sku: "WCP-0749", options: "40T", qty: 2, unitPriceIls: 120 },
  { title: "Kraken X60 <Motor>", sku: null, options: null, qty: 1, unitPriceIls: 900 },
];

/** One sample of every email. */
const SAMPLES: { [E in keyof EmailData]: EmailData[E] } = {
  request_received: { orderNumber: 1071, teamName: "אורביט FRC 1690", lines, totalIls: 1140, quoteDays: 2, orderUrl: `${site}/orders/x`, adminUrl: `${site}/admin?open=x` },
  team_signed_up: { teamName: "אורביט FRC 1690", contactName: "דנה", email: "team@example.com", adminUrl: `${site}/admin/teams` },
  join_request: { teamName: "אורביט FRC 1690", email: "new@example.com", name: null, teamUrl: `${site}/team`, adminUrl: `${site}/admin/teams` },
  quote_ready: { orderNumber: 1071, teamName: "אורביט FRC 1690", totalIls: 1240, approveUrl: `${site}/q/abc.def`, orderUrl: `${site}/orders/x`, linkDays: 14 },
  quote_approved: { orderNumber: 1071, teamName: "אורביט FRC 1690", totalIls: 1240, adminUrl: `${site}/admin?open=x` },
  quote_rejected: { orderNumber: 1071, teamName: "אורביט FRC 1690", reason: "יקר מדי", adminUrl: `${site}/admin?open=x` },
  order_cancelled: { orderNumber: 1071, teamName: "אורביט FRC 1690", adminUrl: `${site}/admin?open=x` },
  change_requested: { orderNumber: 1071, teamName: "אורביט FRC 1690", reason: "בלי הגיר", adminUrl: `${site}/admin?open=x` },
  link_requested: { orderNumber: 1071, teamName: "אורביט FRC 1690", email: "team@example.org", adminUrl: `${site}/admin?open=x` },
  invite: { teamName: "אורביט FRC 1690", url: `${site}/invite/abc` },
  stage: { orderNumber: 1071, teamName: "אורביט FRC 1690", stage: "ready", pickup: true, orderUrl: `${site}/orders/x` },
  quote_reminder: { orderNumber: 1071, teamName: "אורביט FRC 1690", days: 4, approveUrl: null, orderUrl: `${site}/orders/x` },
  admin_digest: { items: [{ orderNumber: 1072, teamName: "סייבר FTC 12345", hours: 30, url: `${site}/admin?open=y` }], adminUrl: `${site}/admin` },
};

describe("renderEmail", () => {
  for (const [event, data] of Object.entries(SAMPLES)) {
    for (const audience of ["team", "admin"] as const) {
      it(`${event} for the ${audience} is Hebrew, RTL, with one button`, () => {
        const email = renderEmail(event as keyof EmailData, audience, data as never);
        expect(email.subject.length).toBeGreaterThan(3);
        expect(email.html).toContain('<html lang="he" dir="rtl">');
        expect(email.html).toContain('<bdi dir="ltr"');
        expect(email.html).not.toContain("·");
        expect(email.html.match(/border-radius:999px;background/g)?.length ?? 0).toBeLessThanOrEqual(1);
        expect(email.text).toMatch(/https:\/\//);
      });
    }
  }

  it("escapes part names and keeps SKUs left to right", () => {
    const { html } = renderEmail("request_received", "team", SAMPLES.request_received);
    expect(html).toContain("Kraken X60 &lt;Motor&gt;");
    expect(html).not.toContain("<Motor>");
    expect(html).toContain('<bdi dir="ltr" style="unicode-bidi:isolate">WCP-0749</bdi>');
    expect(html).toContain("הצעת מחיר תגיע תוך");
  });

  it("puts the personal approve link on the quote's button", () => {
    const { html } = renderEmail("quote_ready", "team", SAMPLES.quote_ready);
    expect(html).toContain(`href="${site}/q/abc.def"`);
    expect(html).toContain("צפייה ואישור");
  });

  it("says pickup or delivery when the order is ready", () => {
    expect(renderEmail("stage", "team", SAMPLES.stage).html).toContain("מוכנה לאיסוף");
    expect(renderEmail("stage", "team", { ...SAMPLES.stage, pickup: false }).html).toContain("במשלוח");
  });

  it("names the stage with the team's word from the status dictionary", () => {
    expect(renderEmail("stage", "team", SAMPLES.stage).subject).toBe(`הזמנה 1071 ${statusLabel("to_team", "team", true)}`);
    expect(renderEmail("stage", "team", { ...SAMPLES.stage, pickup: false }).subject).toBe(`הזמנה 1071 ${statusLabel("to_team", "team", false)}`);
    expect(renderEmail("stage", "team", { ...SAMPLES.stage, stage: "arrived" }).subject).toBe(`הזמנה 1071 ${statusLabel("at_warehouse", "team")}`);
  });

  it("never claims VAT", () => {
    for (const [event, data] of Object.entries(SAMPLES)) {
      expect(renderEmail(event as keyof EmailData, "team", data as never).html).not.toContain("מע״מ");
    }
  });
});

describe("deliver", () => {
  const recipients: Recipient[] = recipientsFor("request_received", {
    team: [
      { userId: "u1", email: "a@example.com", emailOff: [] },
      { userId: "u2", email: "b@example.com", emailOff: [] },
    ],
    admins: [{ userId: "a1", email: "admin@example.com" }],
  });

  it("sends one email per recipient through the transport, each for its audience", async () => {
    const sent: OutgoingEmail[] = [];
    const results = await deliver(recipients, (r) => renderEmail("request_received", r.audience, SAMPLES.request_received), async (e) => {
      sent.push(e);
      return { id: `id-${sent.length}` };
    });
    expect(sent.map((e) => e.to)).toEqual(["a@example.com", "b@example.com", "admin@example.com"]);
    expect(sent[0].subject).toBe("קיבלנו את הבקשה 1071");
    expect(sent[2].subject).toContain("בקשה חדשה 1071");
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.map((r) => r.providerId)).toEqual(["id-1", "id-2", "id-3"]);
  });

  it("reports a failed send without throwing and goes on", async () => {
    const results = await deliver(recipients, (r) => renderEmail("request_received", r.audience, SAMPLES.request_received), async (e) => {
      if (e.to === "b@example.com") throw new Error("Resend 422: invalid");
      return { id: "ok" };
    });
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[1].error).toBe("Resend 422: invalid");
  });

  it("has no Resend transport without both variables", () => {
    expect(resendTransport({})).toBeNull();
    expect(resendTransport({ RESEND_API_KEY: "re_x" })).toBeNull();
    expect(resendTransport({ RESEND_API_KEY: "re_x", EMAIL_FROM: "COTS-IL <x@y.z>" })).toBeTypeOf("function");
  });
});

describe("the admin's own wording (M6)", () => {
  const options = (template: { subject: string | null; body: string | null }) => ({ template });

  it("changes nothing without a template, apart from the site tagline in the footer", () => {
    const plain = renderEmail("quote_ready", "team", SAMPLES.quote_ready);
    expect(renderEmail("quote_ready", "team", SAMPLES.quote_ready, options({ subject: null, body: null }))).toEqual(plain);
    expect(plain.html).toContain("בשקלים לפי שער בנק ישראל");
  });

  it("swaps in the subject and body with the order's details, keeping the heading, button and link note", () => {
    const email = renderEmail("quote_ready", "team", SAMPLES.quote_ready, options({ subject: "הצעה {מספר הזמנה} מחכה", body: "היי {קבוצה}, ההצעה על {סכום} מוכנה.\n\nהקישור תקף {ימים} ימים." }));
    expect(email.subject).toBe("הצעה 1071 מחכה");
    expect(email.html).toContain("היי אורביט FRC 1690, ההצעה על");
    expect(email.html).toContain("הצעת המחיר מוכנה");
    expect(email.html).toContain("צפייה ואישור");
    expect(email.text).toContain("היי אורביט FRC 1690");
    expect(email.text).not.toContain("כולל משלוח");
  });

  it("escapes what a template or a value carries", () => {
    const email = renderEmail("quote_rejected", "admin", { ...SAMPLES.quote_rejected, reason: "<script>x</script>" }, options({ subject: null, body: "סיבה: {סיבה} <b>" }));
    expect(email.html).not.toContain("<script>x");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<b>");
  });

  it("uses the business facts and the stage's own words as tokens", () => {
    const email = renderEmail("stage", "team", SAMPLES.stage, {
      template: { subject: "{סטטוס}", body: "{הודעת השלב} שלום, אפשר להתקשר ל{טלפון העסק}" },
      facts: { "טלפון העסק": { value: "03-1234567", ltr: true } },
    });
    expect(email.subject).toBe(statusLabel("to_team", "team", true));
    expect(email.html).toContain("אפשר לבוא לאסוף.");
    expect(email.html).toContain("03-1234567");
  });

  it("takes the tagline in the footer, and the days a join link lasts", () => {
    expect(renderEmail("invite", "team", SAMPLES.invite, { tagline: "המשפט שלנו" }).html).toContain("COTS-IL</bdi>, המשפט שלנו.");
    expect(renderEmail("invite", "team", SAMPLES.invite).html).toContain("לשבועיים");
    expect(renderEmail("invite", "team", { ...SAMPLES.invite, days: 7 }).html).toContain("לשבוע.");
  });

  it("leaves nothing behind for the next email", () => {
    renderEmail("quote_ready", "team", SAMPLES.quote_ready, options({ subject: "אחר", body: "אחר" }));
    expect(renderEmail("quote_ready", "team", SAMPLES.quote_ready).subject).toBe("הצעת המחיר להזמנה 1071 מוכנה");
  });

  it("shows the approval link's real lifetime", () => {
    expect(renderEmail("quote_ready", "team", { ...SAMPLES.quote_ready, linkDays: 30 }).html).toContain("בתוקף");
    expect(renderEmail("quote_ready", "team", { ...SAMPLES.quote_ready, linkDays: 30 }).html).toContain(">30<");
  });
});
