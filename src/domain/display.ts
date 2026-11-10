/** How a team, a date and an address read everywhere (S14). Pure, so pages and exports agree. */

export type TeamRef = { name: string; program: string; number: number | string };

/** "<name> <program> <number>", e.g. "אורביט FRC 1690". Render it inside one `<bdi>` (see `TeamName`). */
export function teamDisplay(team: TeamRef) {
  return `${team.name.trim()} ${team.program} ${team.number}`.trim();
}

const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", timeZone: "Asia/Jerusalem" });
const dayMonthYear = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Asia/Jerusalem" });
const yearOf = new Intl.DateTimeFormat("en-GB", { year: "numeric", timeZone: "Asia/Jerusalem" });

/** "10/11" for a date this year (Israel time), "10/11/25" for any other year. Always day first. */
export function formatDay(date: Date, now: Date = new Date()) {
  return yearOf.format(date) === yearOf.format(now) ? dayMonth.format(date) : dayMonthYear.format(date);
}

export type AddressParts = { street: string; houseNumber: string; city: string };

/** One line for the delivery note: "הרצל 12, תל אביב". */
export function formatAddress({ street, houseNumber, city }: AddressParts) {
  const line = [street.trim(), houseNumber.trim()].filter(Boolean).join(" ");
  return [line, city.trim()].filter(Boolean).join(", ");
}

const HOUSE_NUMBER = /^\d{1,5}[א-תa-zA-Z]?(\/\d{1,4})?$/;

/** Splits a saved address back into its fields. Anything unrecognised stays in `street`, so nothing is lost. */
export function parseAddress(address: string | null | undefined): AddressParts {
  const text = (address ?? "").trim();
  const comma = text.lastIndexOf(",");
  const head = comma >= 0 ? text.slice(0, comma).trim() : text;
  const city = comma >= 0 ? text.slice(comma + 1).trim() : "";
  const words = head.split(/\s+/);
  const last = words.at(-1) ?? "";
  if (words.length > 1 && HOUSE_NUMBER.test(last)) return { street: words.slice(0, -1).join(" "), houseNumber: last, city };
  return { street: head, houseNumber: "", city };
}

/** Which address fields are missing for a delivery, as field names. Empty means it can ship. */
export function missingAddressParts(parts: AddressParts): (keyof AddressParts)[] {
  const missing: (keyof AddressParts)[] = [];
  if (parts.street.trim().length < 2) missing.push("street");
  if (!HOUSE_NUMBER.test(parts.houseNumber.trim())) missing.push("houseNumber");
  if (parts.city.trim().length < 2) missing.push("city");
  return missing;
}
