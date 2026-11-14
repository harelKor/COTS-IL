import { describe, expect, it } from "vitest";
import { israelDay, photoOfTheDay, photoSrc, ROBOT_PHOTOS } from "./robot-photos";

describe("robot photos", () => {
  it("changes photo once a day, each in turn", () => {
    expect([0, 1, 2, 3, 4].map((d) => photoOfTheDay(3, d))).toEqual([0, 1, 2, 0, 1]);
    expect(photoOfTheDay(1, 20_000)).toBe(0);
    expect(photoOfTheDay(0, 5)).toBe(0);
  });

  it("counts days in Israel time", () => {
    // 23:30 UTC is already the next day in Israel.
    expect(israelDay(new Date("2026-11-14T23:30:00Z"))).toBe(israelDay(new Date("2026-11-15T09:00:00Z")));
    expect(israelDay(new Date("2026-11-14T21:00:00Z")) - israelDay(new Date("2026-11-14T12:00:00Z"))).toBe(0);
  });

  it("points at the prepared files", () => {
    expect(ROBOT_PHOTOS.length).toBeGreaterThan(0);
    expect(photoSrc("1690-whisper", 960, "avif")).toBe("/robots/1690-whisper-960.avif");
  });
});
