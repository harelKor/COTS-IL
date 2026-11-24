import { describe, expect, it } from "vitest";
import {
  canDeleteTeam,
  canDeleteUser,
  changedFields,
  historyText,
  mergedQty,
  nextStatus,
  parseAdminTeam,
  teamCanSend,
  transferRemovals,
  usersToDeleteWithTeam,
} from "./team-admin";

describe("teamCanSend", () => {
  it("lets an approved team send, and a pending one only while the setting allows", () => {
    expect(teamCanSend("active", false)).toBe(true);
    expect(teamCanSend("pending", true)).toBe(true);
    expect(teamCanSend("pending", false)).toBe(false);
  });
  it("never lets a rejected or suspended team send", () => {
    for (const allow of [true, false]) {
      expect(teamCanSend("rejected", allow)).toBe(false);
      expect(teamCanSend("suspended", allow)).toBe(false);
    }
  });
});

describe("nextStatus", () => {
  it("suspends an active or pending team, nothing else", () => {
    expect(nextStatus("active", "suspend")).toBe("suspended");
    expect(nextStatus("pending", "suspend")).toBe("suspended");
    expect(nextStatus("suspended", "suspend")).toBeNull();
    expect(nextStatus("rejected", "suspend")).toBeNull();
  });
  it("reactivates a suspended or rejected team as approved", () => {
    expect(nextStatus("suspended", "reactivate")).toBe("active");
    expect(nextStatus("rejected", "reactivate")).toBe("active");
    expect(nextStatus("active", "reactivate")).toBeNull();
    expect(nextStatus("pending", "reactivate")).toBeNull();
  });
});

describe("deleting", () => {
  it("deletes only a team with no orders and no deliveries", () => {
    expect(canDeleteTeam({ orders: 0, deliveries: 0 })).toBe(true);
    expect(canDeleteTeam({ orders: 1, deliveries: 0 })).toBe(false);
    expect(canDeleteTeam({ orders: 0, deliveries: 0, payments: 1 })).toBe(false);
    expect(canDeleteTeam({ orders: 0, deliveries: 1 })).toBe(false);
  });
  it("never deletes an admin, or a user who sent a request or approved a quote", () => {
    expect(canDeleteUser({ isAdmin: false, ordersSent: 0, approvals: 0 })).toBe(true);
    expect(canDeleteUser({ isAdmin: true, ordersSent: 0, approvals: 0 })).toBe(false);
    expect(canDeleteUser({ isAdmin: false, ordersSent: 2, approvals: 0 })).toBe(false);
    expect(canDeleteUser({ isAdmin: false, ordersSent: 0, approvals: 1 })).toBe(false);
  });
  it("takes along only the users who are on no other team", () => {
    const base = { isAdmin: false, ordersSent: 0, approvals: 0 };
    expect(
      usersToDeleteWithTeam([
        { userId: "a", otherTeams: 0, ...base },
        { userId: "b", otherTeams: 1, ...base },
        { userId: "c", otherTeams: 0, ...base, isAdmin: true },
      ]),
    ).toEqual(["a"]);
  });
});

describe("merging and transfers", () => {
  it("adds cart quantities up to the cart's limit", () => {
    expect(mergedQty(2, 3)).toBe(5);
    expect(mergedQty(9000, 2000)).toBe(9999);
  });
  it("replace takes every current sign-in off, add keeps them", () => {
    expect(transferRemovals(["a", "b"], "replace", null)).toEqual(["a", "b"]);
    expect(transferRemovals(["a", "b"], "replace", "b")).toEqual(["a"]);
    expect(transferRemovals(["a", "b"], "add", "c")).toEqual([]);
  });
});

describe("parseAdminTeam", () => {
  const good = { name: "Orbit", program: "FRC", number: "1690", contactName: "דנה כהן", contactPhone: "050-1234567", contactEmail: "Mentor@Example.com", address: "" };
  it("accepts a good team and keeps blanks as null", () => {
    expect(parseAdminTeam(good)).toEqual({
      ok: true,
      value: { name: "Orbit", program: "FRC", number: 1690, contactName: "דנה כהן", contactPhone: "050-1234567", contactEmail: "mentor@example.com", address: null },
    });
  });
  it("applies the registration's name checks", () => {
    expect(parseAdminTeam({ ...good, name: "ttt" }).ok).toBe(false);
    expect(parseAdminTeam({ ...good, contactName: "fff" }).ok).toBe(false);
    expect(parseAdminTeam({ ...good, contactName: "" }).ok).toBe(true);
  });
  it("refuses a bad number, programme, phone or email", () => {
    expect(parseAdminTeam({ ...good, number: "0" }).ok).toBe(false);
    expect(parseAdminTeam({ ...good, number: "12a" }).ok).toBe(false);
    expect(parseAdminTeam({ ...good, program: "VEX" }).ok).toBe(false);
    expect(parseAdminTeam({ ...good, contactPhone: "123" }).ok).toBe(false);
    expect(parseAdminTeam({ ...good, contactEmail: "not-an-email" }).ok).toBe(false);
  });
});

describe("changedFields", () => {
  it("keeps only what changed", () => {
    expect(changedFields({ name: "a", number: 1, address: null }, { name: "b", number: 1, address: null })).toEqual({
      before: { name: "a" },
      after: { name: "b" },
    });
  });
});

describe("historyText", () => {
  it("reads the team's own actions in Hebrew", () => {
    expect(historyText({ entity: "team", action: "approve", before: null, after: null })).toBe("הקבוצה אושרה");
    expect(historyText({ entity: "membership", action: "remove", before: { email: "a@b.co" }, after: null })).toBe("הוסרה כתובת כניסה: a@b.co");
    expect(historyText({ entity: "team", action: "suspend", before: null, after: { reason: "חוב" } })).toBe("החשבון הושהה: חוב");
    expect(historyText({ entity: "team", action: "merge", before: null, after: { fromName: "Orbit 2" } })).toBe("אוחדה לתוכה קבוצה כפולה: Orbit 2");
  });
  it("still shows an action it doesn't know", () => {
    expect(historyText({ entity: "team", action: "something_new", before: null, after: null })).toBe("team: something_new");
  });
});
