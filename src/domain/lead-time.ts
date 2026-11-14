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

/** When a part reaches Israel, counted from the quote's approval; for a preorder, from the day the supplier ships it. */
export function arrivalText(lead: { minDays: number; maxDays: number } | null | undefined, shipsLater = false): string | null {
  const text = leadTimeText(lead);
  if (!text) return null;
  return shipsLater ? `מגיע לישראל תוך ${text} מרגע שהספק שולח` : `מגיע לישראל תוך ${text} מאישור ההצעה`;
}

/** The short form for an offer card or a cart section: "מגיע תוך 7–10 ימים". */
export function arrivalShort(lead: { minDays: number; maxDays: number } | null | undefined): string | null {
  const text = leadTimeText(lead);
  return text ? `מגיע תוך ${text}` : null;
}
