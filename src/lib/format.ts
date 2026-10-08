import { toDbDate, type IsoDate } from "@/lib/training/dates";

/** A calendar date in the viewer's language ("mié, 7 oct"). UTC because IsoDate carries no time zone. */
export function formatDay(
  date: IsoDate, locale: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(toDbDate(date));
}
