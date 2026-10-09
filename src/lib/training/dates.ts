/** Calendar dates as ISO strings (YYYY-MM-DD). All arithmetic runs in UTC, so DST never shifts a day. */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function toDbDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function fromDbDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toDbDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDbDate(d);
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / DAY_MS);
}

export function isMonday(date: IsoDate): boolean {
  return toDbDate(date).getUTCDay() === 1;
}

export function mondayOf(date: IsoDate): IsoDate {
  return addDays(date, -((toDbDate(date).getUTCDay() + 6) % 7));
}

export function weekIndexOf(dayIndex: number): number {
  return Math.floor(dayIndex / 7);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The month `YYYY-MM` shifted by whole months. */
export function addMonths(month: string, by: number): string {
  return fromDbDate(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1))).slice(0, 7);
}

/** Monday-first weeks covering the month `YYYY-MM`. */
export function monthGrid(month: string): IsoDate[][] {
  const first = `${month}-01`;
  const nextMonthFirst = fromDbDate(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)));
  const weeks: IsoDate[][] = [];
  for (let monday = mondayOf(first); monday < nextMonthFirst; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
  }
  return weeks;
}

export type Timeline =
  | { kind: "continuous"; startDate: IsoDate; publishedWeeks: ReadonlySet<number> }
  | { kind: "closed"; startDate: IsoDate; weeks: number; published: boolean };

export function dateOfDay(t: Timeline, dayIndex: number): IsoDate {
  return addDays(t.startDate, dayIndex);
}

export function inRange(t: Timeline, dayIndex: number): boolean {
  if (!Number.isInteger(dayIndex) || dayIndex < 0) return false;
  return t.kind === "continuous" || dayIndex < t.weeks * 7;
}

export function dayIndexOf(t: Timeline, date: IsoDate): number | null {
  const index = daysBetween(t.startDate, date);
  return inRange(t, index) ? index : null;
}

export function isDayVisible(t: Timeline, dayIndex: number): boolean {
  if (!inRange(t, dayIndex)) return false;
  return t.kind === "continuous" ? t.publishedWeeks.has(weekIndexOf(dayIndex)) : t.published;
}

export function canLogDay(t: Timeline, dayIndex: number, today: IsoDate): boolean {
  return isDayVisible(t, dayIndex) && dateOfDay(t, dayIndex) <= today;
}
