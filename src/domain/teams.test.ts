import { describe, expect, it } from "vitest";
import { firstTeamUrl, inviteExpiry, inviteLasts, isPersonName, isPhone, isTeamName, parseTeamNumber, TEAM_NUMBER_MAX, wouldLeaveNoMembers } from "./teams";

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

describe("parseTeamNumber", () => {
  it("reads whole numbers from 1 to the limit", () => {
    expect(parseTeamNumber("1690")).toBe(1690);
    expect(parseTeamNumber(" 23014 ")).toBe(23014);
    expect(parseTeamNumber(7)).toBe(7);
    expect(parseTeamNumber(String(TEAM_NUMBER_MAX))).toBe(TEAM_NUMBER_MAX);
  });

  it("refuses anything else", () => {
    for (const bad of ["", "0", "-5", "12.5", "1e3", "100000", "abc", "16 90", null, undefined, 0]) {
      expect(parseTeamNumber(bad)).toBeNull();
    }
  });
});

describe("isPhone", () => {
  it("accepts Israeli and international numbers", () => {
    expect(isPhone("050-1234567")).toBe(true);
    expect(isPhone("+972 50 123 4567")).toBe(true);
    expect(isPhone("(03) 1234567")).toBe(true);
  });

  it("refuses short or lettered input", () => {
    expect(isPhone("12345")).toBe(false);
    expect(isPhone("050-CALL-ME")).toBe(false);
    expect(isPhone("")).toBe(false);
  });
});

describe("isTeamName", () => {
  it("takes real names in Hebrew and Latin, with digits", () => {
    for (const name of ["Orbit 1690", "אורביט", "3D Robotics", "ביה״ס הדמוקרטי"]) expect(isTeamName(name)).toBe(true);
  });
  it("refuses test data and too-short names", () => {
    for (const name of ["or", "ttt", "fff", "...", "12", "  a ", "1234", ""]) expect(isTeamName(name)).toBe(false);
  });
});

describe("isPersonName", () => {
  it("takes real names", () => {
    for (const name of ["דנה כהן", "Li", "O'Brien", "אבי-חי", "Ann-Marie Smith", 'ד"ר לוי']) expect(isPersonName(name)).toBe(true);
  });
  it("refuses digits, symbols and repeated letters", () => {
    for (const name of ["fff", "ttt", "a", "י", "123", "דנה 2", "a@b.co", "", "   "]) expect(isPersonName(name)).toBe(false);
  });
});

describe("firstTeamUrl", () => {
  it("points each program to its events site", () => {
    expect(firstTeamUrl("FRC", 1690)).toBe("https://frc-events.firstinspires.org/team/1690");
    expect(firstTeamUrl("FTC", 5)).toBe("https://ftc-events.firstinspires.org/team/5");
  });
});

describe("invite timing", () => {
  it("lasts the days the admin set, 14 by default", () => {
    expect(inviteExpiry(new Date("2026-01-01T00:00:00Z"), 3).toISOString()).toBe("2026-01-04T00:00:00.000Z");
  });

  it("says how long in words", () => {
    expect(inviteLasts(14)).toBe("לשבועיים");
    expect(inviteLasts(7)).toBe("לשבוע");
    expect(inviteLasts(30)).toBe("ל-30 ימים");
  });
});
