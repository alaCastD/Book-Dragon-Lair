// Dates for "Finished on". A finished date is a calendar day, not a moment,
// so it's stored as noon local time: that way time zones can't shift it to
// the day before or after when it's shown.

/** The ISO timestamp saved for a chosen day (noon local time that day). */
export function finishedIso(day: Date): string {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0);
  return d.toISOString();
}

/** The day to show in the date picker for a saved value (today if none or unreadable). */
export function pickerDate(iso: string | null, now = new Date()): Date {
  const d = iso ? new Date(iso) : now;
  return Number.isNaN(d.getTime()) ? now : d;
}

/** "2026-11-23", the format a browser date input uses (local calendar day). */
export function toDateInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Reads a browser date input value ("2026-11-23") as that local day; null if invalid. */
export function fromDateInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  const date = new Date(y, mo, d, 12);
  return date.getFullYear() === y && date.getMonth() === mo && date.getDate() === d ? date : null;
}

/** The earliest finished date accepted. */
export const EARLIEST_FINISHED = new Date(1900, 0, 1, 12);

/** Why a chosen day can't be used, or null if it's fine. */
export function finishedDateProblem(day: Date, now = new Date()): string | null {
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (day.getTime() > endOfToday.getTime()) return "The finished date can't be in the future.";
  if (day.getTime() < EARLIEST_FINISHED.getTime()) return 'Choose a date after 1900.';
  return null;
}
