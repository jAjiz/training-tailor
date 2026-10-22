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

/** "5 minutes ago" in the viewer's language; older than 30 days it is a short date. Computed on the server so it cannot differ from the client's first render. */
export function relativeTime(date: Date, now: Date, locale: string): string {
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (seconds < 60) return rtf.format(0, "second");
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86_400) return rtf.format(-Math.floor(seconds / 3600), "hour");
  if (seconds < 30 * 86_400) return rtf.format(-Math.floor(seconds / 86_400), "day");
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(date).replace(/\.$/, "");
}
