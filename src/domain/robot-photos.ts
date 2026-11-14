/**
 * Team 1690 Orbit's robots behind the home page (src/components/robot-backdrop.tsx): the tall
 * one beside the motto ("hero"), the compact one lower down on the left ("lower"). Each is
 * prepared by `npm run robot-photos` (the robot sharp, the arena a blurred blue texture that
 * melts away, no face recognizable) into public/robots/<id>-<width>.{avif,webp}.
 * More photos in a slot take turns: the photo of the day, crossfading to the next while open.
 * TODO: a "תמונות רקע" list in הגדרות › תוכן האתר with uploads to Storage, once there are more.
 */
export type RobotPhoto = {
  id: string;
  /** The prepared widths, and the full image's size (for the aspect ratio). */
  widths: number[];
  width: number;
  height: number;
};

export type RobotSlot = "hero" | "lower";

export const ROBOT_PHOTOS: Record<RobotSlot, RobotPhoto[]> = {
  hero: [{ id: "1690-whisper", widths: [720, 1080, 1420], width: 1421, height: 1993 }],
  lower: [{ id: "1690-crescendo", widths: [480, 800], width: 800, height: 598 }],
};

const DAY_MS = 86_400_000;
/** Israel time, so the photo changes at midnight here (UTC+2 or +3; the hour of slack is fine). */
const ISRAEL_OFFSET_MS = 2 * 3_600_000;

/** Days since 1970 in Israel: the same number all day for every visitor. */
export function israelDay(now: Date): number {
  return Math.floor((now.getTime() + ISRAEL_OFFSET_MS) / DAY_MS);
}

/** The photo of the day: each photo in turn, one a day. */
export function photoOfTheDay(count: number, day: number): number {
  if (count <= 0) return 0;
  return ((day % count) + count) % count;
}

export const photoSrc = (id: string, width: number, type: "avif" | "webp") => `/robots/${id}-${width}.${type}`;

/** A srcset of every prepared width, e.g. "/robots/x-720.avif 720w, …". */
export const photoSrcSet = (p: RobotPhoto, type: "avif" | "webp") =>
  p.widths.map((w) => `${photoSrc(p.id, w, type)} ${Math.min(w, p.width)}w`).join(", ");
