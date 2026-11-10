/** "7–10 ימים", "7 ימים", or null when the lead time isn't known. */
export function leadTimeText(lead: { minDays: number; maxDays: number } | null | undefined): string | null {
  if (!lead) return null;
  const min = Math.max(0, Math.round(Math.min(lead.minDays, lead.maxDays)));
  const max = Math.max(0, Math.round(Math.max(lead.minDays, lead.maxDays)));
  if (max === 0) return null;
  return min === max || min === 0 ? `${max} ימים` : `${min}–${max} ימים`;
}

/** The overall range across suppliers, for "typical lead time" on the home page. */
export function typicalLeadTime(leads: ({ minDays: number; maxDays: number } | null | undefined)[]) {
  const known = leads.filter((l): l is { minDays: number; maxDays: number } => !!l);
  if (known.length === 0) return null;
  return leadTimeText({ minDays: Math.min(...known.map((l) => l.minDays)), maxDays: Math.max(...known.map((l) => l.maxDays)) });
}
