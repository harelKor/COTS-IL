import { describe, expect, it } from "vitest";
import { canManageTeam, inviteExpiry, wouldLeaveNoAdmin } from "./teams";

describe("canManageTeam", () => {
  it("is only for team admins", () => {
    expect(canManageTeam("team_admin")).toBe(true);
    expect(canManageTeam("buyer")).toBe(false);
    expect(canManageTeam("viewer")).toBe(false);
  });
});

describe("wouldLeaveNoAdmin", () => {
  const members = [
    { userId: "a", role: "team_admin" as const },
    { userId: "b", role: "buyer" as const },
  ];

  it("protects the last team admin from removal and demotion", () => {
    expect(wouldLeaveNoAdmin(members, "a", null)).toBe(true);
    expect(wouldLeaveNoAdmin(members, "a", "buyer")).toBe(true);
  });

  it("allows changes that keep an admin", () => {
    expect(wouldLeaveNoAdmin(members, "b", null)).toBe(false);
    expect(wouldLeaveNoAdmin(members, "a", "team_admin")).toBe(false);
    expect(wouldLeaveNoAdmin([...members, { userId: "c", role: "team_admin" }], "a", null)).toBe(false);
  });
});

describe("inviteExpiry", () => {
  it("is two weeks out", () => {
    expect(inviteExpiry(new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
});
