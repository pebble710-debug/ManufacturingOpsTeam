// UTC time helpers for the seed. All values are epoch milliseconds (UTC).
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export const ms = (y: number, m: number, d: number, h = 0, mi = 0, s = 0): number => Date.UTC(y, m - 1, d, h, mi, s);
export const isoTs = (t: number): string => new Date(t).toISOString();
export const isoDate = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const dayStart = (t: number): number => Math.floor(t / DAY) * DAY;
/** 0 = Sunday .. 6 = Saturday */
export const dow = (t: number): number => new Date(t).getUTCDay();
export const isWeekend = (t: number): boolean => dow(t) === 0 || dow(t) === 6;

/** If t falls on a weekend, move to the previous Friday keeping the time of day. */
export function snapWeekdayBack(t: number): number {
  let x = t;
  while (isWeekend(x)) x -= DAY;
  return x;
}

/** ISO 8601 week number of the UTC date of t. */
export function isoWeek(t: number): number {
  const d = new Date(dayStart(t));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
}
