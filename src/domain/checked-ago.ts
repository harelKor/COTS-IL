const HOUR = 60 * 60 * 1000;
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Asia/Jerusalem" });

/**
 * "נבדק לפני 5 שעות": how long ago the supplier's yes/no was read. Without a
 * today (a prerendered page) it falls back to the day ("נבדק 13/11").
 */
export function checkedAgo(checkedAt: string | Date, now: number | null): string {
  const at = new Date(checkedAt);
  if (now === null) return `נבדק ${dayMonth.format(at)}`;
  const hours = Math.floor(Math.max(0, now - at.getTime()) / HOUR);
  if (hours < 1) return "נבדק לפני פחות משעה";
  if (hours === 1) return "נבדק לפני שעה";
  if (hours === 2) return "נבדק לפני שעתיים";
  if (hours < 24) return `נבדק לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "נבדק אתמול";
  if (days === 2) return "נבדק לפני יומיים";
  return `נבדק לפני ${days} ימים`;
}
