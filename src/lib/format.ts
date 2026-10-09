import { toDbDate, type IsoDate } from "@/lib/training/dates";

/** A calendar date in the viewer's language ("mié, 7 oct"). UTC because IsoDate carries no time zone. */
export function formatDay(
  date: IsoDate, locale: string,
  options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" },
): string {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(toDbDate(date));
}

/** Up to two initials, from the first and last words ("Juan Ajiz" → "JA"); "?" for a blank name. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (words[0][0] + last).toUpperCase();
}

/** A span of dates as one label ("12–18 oct 2026"), shared parts written once. */
export function formatDayRange(from: IsoDate, to: IsoDate, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .formatRange(toDbDate(from), toDbDate(to));
}
