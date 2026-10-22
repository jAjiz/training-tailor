import { addDays, daysBetween, mondayOf, todayIn, type IsoDate } from "@/lib/training/dates";

/** The first Monday strictly after today in `timeZone`. */
export function comingMonday(now: Date, timeZone = "Europe/Madrid"): IsoDate {
  return addDays(mondayOf(todayIn(timeZone, now)), 7);
}

/** Whole weeks from the program start to `monday`; negative before the start. */
export function reminderWeekIndex(programStart: IsoDate, monday: IsoDate): number {
  return daysBetween(programStart, monday) / 7;
}
