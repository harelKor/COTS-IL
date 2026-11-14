/**
 * Robot photos for the home page backdrop (src/components/robot-backdrop.tsx), team 1690 Orbit's
 * first. Each is prepared by `npm run robot-photos` (crop to the robot, calm and blur the rest, so
 * no face in the stands can be recognized) into public/robots/<id>-{640,960}.{avif,webp}.
 * TODO: a "תמונות רקע" list in הגדרות › תוכן האתר with uploads to Storage, once there are more.
 */
export type RobotPhoto = {
  id: string;
  /** Where the robot is in the frame (CSS object-position), so a narrow crop keeps it in view. */
  focus: string;
};

export const ROBOT_PHOTOS: RobotPhoto[] = [{ id: "1690-whisper", focus: "50% 40%" }];

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

export const photoSrc = (id: string, width: 640 | 960, type: "avif" | "webp") => `/robots/${id}-${width}.${type}`;
