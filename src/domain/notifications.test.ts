import { describe, expect, it } from "vitest";
import { emailAudiences, emailConfig, emailOffFromForm, recipientsFor, reminderDue, stageDue, waitingTooLong } from "./notifications";

const team = [
  { userId: "u1", email: "Team@Example.com", emailOff: [] },
  { userId: "u2", email: "mentor@example.com", emailOff: ["progress", "reminders"] },
];
const admins = [{ userId: "a1", email: "admin@example.com" }];
const people = { team, admins };
const emails = (r: { email: string; audience: string }[]) => r.map((x) => `${x.audience}:${x.email}`);

describe("recipientsFor", () => {
  it("sends a request receipt to every team email and the admin", () => {
    expect(emails(recipientsFor("request_received", people))).toEqual(["team:team@example.com", "team:mentor@example.com", "admin:admin@example.com"]);
  });
  it("sends the quote to every team email, even one that turned progress emails off", () => {
    expect(emails(recipientsFor("quote_ready", people))).toEqual(["team:team@example.com", "team:mentor@example.com"]);
  });
  it("sends decisions and sign-ups to the admin only", () => {
    for (const e of ["quote_approved", "quote_rejected", "order_cancelled", "team_signed_up", "admin_digest"] as const) {
      expect(emails(recipientsFor(e, people))).toEqual(["admin:admin@example.com"]);
    }
  });
  it("skips addresses that turned a group off", () => {
    expect(emails(recipientsFor("stage", people))).toEqual(["team:team@example.com"]);
    expect(emails(recipientsFor("quote_reminder", people))).toEqual(["team:team@example.com"]);
  });
  it("sends a join request to the team and the admin", () => {
    expect(recipientsFor("join_request", people)).toHaveLength(3);
  });
  it("dedupes per audience and drops broken addresses", () => {
    const r = recipientsFor("request_received", {
      team: [...team, { userId: "u3", email: "team@example.com ", emailOff: [] }, { userId: "u4", email: "", emailOff: [] }],
      admins: [...admins, { userId: "u1", email: "team@example.com" }],
    });
    expect(emails(r)).toEqual(["team:team@example.com", "team:mentor@example.com", "admin:admin@example.com", "admin:team@example.com"]);
  });
  it("sends nothing with nobody to send to", () => {
    expect(recipientsFor("stage", { team: [], admins })).toEqual([]);
  });
});

describe("stageDue", () => {
  it("maps statuses to stages", () => {
    expect(stageDue("ordered", [])).toBe("ordered");
    expect(stageDue("to_warehouse", [])).toBe("ordered");
    expect(stageDue("at_warehouse", [])).toBe("arrived");
    expect(stageDue("to_team", [])).toBe("ready");
    expect(stageDue("delivered", [])).toBe("delivered");
  });
  it("is null before ordering and for stopped orders", () => {
    for (const s of ["awaiting_quote", "quote_sent", "to_order", "rejected", "cancelled"] as const) expect(stageDue(s, [])).toBeNull();
  });
  it("never repeats a stage or goes back", () => {
    expect(stageDue("to_warehouse", ["ordered"])).toBeNull();
    expect(stageDue("ordered", ["arrived"])).toBeNull();
    expect(stageDue("delivered", ["ordered"])).toBe("delivered");
  });
});

describe("timing", () => {
  const now = new Date("2026-11-11T12:00:00Z");
  it("reminds once after three days", () => {
    expect(reminderDue(new Date("2026-11-08T11:00:00Z"), false, now)).toBe(true);
    expect(reminderDue(new Date("2026-11-08T13:00:00Z"), false, now)).toBe(false);
    expect(reminderDue(new Date("2026-11-01T00:00:00Z"), true, now)).toBe(false);
  });
  it("flags requests waiting over a day", () => {
    expect(waitingTooLong(new Date("2026-11-10T11:00:00Z"), now)).toBe(true);
    expect(waitingTooLong(new Date("2026-11-10T13:00:00Z"), now)).toBe(false);
  });
});

describe("emailConfig", () => {
  it("is off unless both variables are set", () => {
    expect(emailConfig({})).toBeNull();
    expect(emailConfig({ RESEND_API_KEY: "re_x" })).toBeNull();
    expect(emailConfig({ RESEND_API_KEY: " ", EMAIL_FROM: "a@b.c" })).toBeNull();
    expect(emailConfig({ RESEND_API_KEY: "re_x", EMAIL_FROM: "COTS-IL <a@b.c>" })).toEqual({ apiKey: "re_x", from: "COTS-IL <a@b.c>" });
  });
});

describe("emailOffFromForm", () => {
  it("stores the groups left unchecked", () => {
    expect(emailOffFromForm(["progress"])).toEqual(["reminders"]);
    expect(emailOffFromForm([])).toEqual(["progress", "reminders"]);
    expect(emailOffFromForm(["progress", "reminders", "junk"])).toEqual([]);
  });
});

describe("admin email routing", () => {
  const two = { team, admins: [...admins, { userId: "a2", email: "other@example.com" }] };

  it("sends everything to every admin unless one turned emails off", () => {
    expect(emails(recipientsFor("quote_approved", two))).toEqual(["admin:admin@example.com", "admin:other@example.com"]);
    expect(emails(recipientsFor("quote_approved", { ...two, adminsOff: [] }))).toEqual(["admin:admin@example.com", "admin:other@example.com"]);
  });

  it("skips an admin who is off, and leaves the team's emails alone", () => {
    const off = { ...two, adminsOff: ["a1"] };
    expect(emails(recipientsFor("quote_approved", off))).toEqual(["admin:other@example.com"]);
    expect(emails(recipientsFor("request_received", off))).toEqual(["team:team@example.com", "team:mentor@example.com", "admin:other@example.com"]);
  });
});

describe("the reminder's timing", () => {
  it("waits as many days as the admin set", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const sent = new Date("2026-11-06T12:00:00Z");
    expect(reminderDue(sent, false, now)).toBe(true);
    expect(reminderDue(sent, false, now, 7)).toBe(false);
    expect(reminderDue(sent, false, now, 2)).toBe(true);
  });
});

describe("emailAudiences", () => {
  it("lists every event once with who gets it, the invite going to a team address", () => {
    const list = emailAudiences();
    const byEvent = Object.fromEntries(list.map((x) => [x.event, x.audiences]));
    expect(list.length).toBe(new Set(list.map((x) => x.event)).size);
    expect(byEvent.request_received).toEqual(["team", "admin"]);
    expect(byEvent.quote_approved).toEqual(["admin"]);
    expect(byEvent.stage).toEqual(["team"]);
    expect(byEvent.invite).toEqual(["team"]);
  });
});
