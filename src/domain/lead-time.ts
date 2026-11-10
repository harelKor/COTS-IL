/** Days from an approved quote to delivery in Israel, as set in src/lib/business.ts. */
export type LeadTime = { minDays: number; maxDays: number };

/** "מגיע לישראל תוך כ-2–3 שבועות", or null while the lead time isn't known. */
export function leadTimeText(lead: LeadTime | null | undefined): string | null {
  if (!lead || lead.maxDays <= 0) return null;
  const weeks = (days: number) => Math.max(1, Math.round(days / 7));
  const min = weeks(lead.minDays);
  const max = weeks(lead.maxDays);
  if (max <= 1) return "מגיע לישראל תוך כשבוע";
  return min === max ? `מגיע לישראל תוך כ-${max} שבועות` : `מגיע לישראל תוך כ-${min}–${max} שבועות`;
}
