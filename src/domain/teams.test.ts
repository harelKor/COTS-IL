import { describe, expect, it } from "vitest";
import { inviteExpiry, wouldLeaveNoMembers } from "./teams";

describe("wouldLeaveNoMembers", () => {
  it("protects the team's last sign-in email", () => {
    expect(wouldLeaveNoMembers(["a"], "a")).toBe(true);
  });

  it("allows removing an email while another one stays", () => {
    expect(wouldLeaveNoMembers(["a", "b"], "a")).toBe(false);
    expect(wouldLeaveNoMembers(["a", "b"], "b")).toBe(false);
  });
});

describe("inviteExpiry", () => {
  it("is two weeks out", () => {
    expect(inviteExpiry(new Date("2026-01-01T00:00:00Z")).toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });
});
