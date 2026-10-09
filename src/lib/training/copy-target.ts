import { addDays, daysBetween, isIsoDate, weekIndexOf, type IsoDate } from "./dates";

/** What a copy targets: a day (a block or a whole day) or a week. */
export type CopyTarget = "day" | "week";

/** Closed programs number weeks and days from 1 on screen; the actions take 0-based indexes. */
export function closedTarget(target: CopyTarget, week: number, day: number | null): number {
  return target === "week" ? week - 1 : (week - 1) * 7 + ((day ?? 1) - 1);
}

/** Continuous programs pick a date: its day index, or the index of the week holding it. Null before the start. */
export function continuousTarget(target: CopyTarget, startDate: IsoDate, date: string): number | null {
  if (!isIsoDate(date)) return null;
  const day = daysBetween(startDate, date);
  if (day < 0) return null;
  return target === "week" ? weekIndexOf(day) : day;
}

/** The date a continuous copy dialog starts on for a day or week index. */
export function defaultTargetDate(target: CopyTarget, startDate: IsoDate, index: number): IsoDate {
  return addDays(startDate, target === "week" ? index * 7 : index);
}
