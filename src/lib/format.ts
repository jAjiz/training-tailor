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
