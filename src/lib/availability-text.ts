import { etaHebrew } from "@/domain/backorder";
import { isAvailabilityFresh } from "@/domain/reports";

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Asia/Jerusalem" });

/** Whether a check date is still fresh. */
export function isFresh(checkedAt: string, now: number | null): boolean {
  return now === null || isAvailabilityFresh(new Date(checkedAt), new Date(now));
}

export type AvailabilityStatus = { text: string; short: string; tone: string; dot: string };

/** "Ships later" for a part: the supplier takes orders but has none on hand, and its ETA words if any. */
export type ShipsLater = { shipsLater?: boolean; eta?: string | null };

/** Availability in words, short and with its check date, and the dot's color. Never a stock count. */
export function availabilityStatus(available: boolean | null, checkedAt: string, fresh: boolean, later: ShipsLater = {}): AvailabilityStatus {
  if (available === null || !fresh) return { text: "זמינות לא אומתה", short: "לא אומת", tone: "text-muted", dot: "bg-muted" };
  const date = dayMonth.format(new Date(checkedAt));
  if (available && later.shipsLater) {
    const eta = etaHebrew(later.eta ?? null);
    return { text: `בהזמנה מראש${eta ? `, צפוי לצאת: ${eta}` : ""} (נבדק ${date})`, short: "בהזמנה מראש", tone: "text-warning", dot: "bg-warning" };
  }
  return available
    ? { text: `זמין אצל הספק (נבדק ${date})`, short: "זמין", tone: "text-success", dot: "bg-success" }
    : { text: `לא זמין כרגע (נבדק ${date})`, short: "לא זמין", tone: "text-warning", dot: "bg-warning" };
}
