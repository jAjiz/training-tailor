import { blockLabel } from "@/lib/training/block-label";
import type { IsoDate } from "@/lib/training/dates";

export const NOTIFICATION_KINDS = ["announcement", "week_published", "fist_bump", "coach_deleted",
  "athlete_joined", "athlete_left", "week_reminder", "coach_approved"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type Audience = "athlete" | "coach";

export const AUDIENCE: Record<NotificationKind, Audience> = {
  announcement: "athlete",
  week_published: "athlete",
  fist_bump: "athlete",
  coach_deleted: "athlete",
  athlete_joined: "coach",
  athlete_left: "coach",
  week_reminder: "coach",
  coach_approved: "coach",
};

type LabelBlock = Parameters<typeof blockLabel>[0];

export type NotificationData = {
  announcement: { programId: string; programName: string; excerpt: string };
  week_published: { programId: string; programName: string; monday: IsoDate };
  fist_bump: { resultId: string; blockId: string; block: LabelBlock; latestName: string; count: number };
  coach_deleted: { programId: string; programName: string };
  athlete_joined: { programId: string; programName: string; athleteName: string };
  athlete_left: { programId: string; programName: string; athleteName: string };
  week_reminder: { programId: string; programName: string; monday: IsoDate; weekIndex: number };
  coach_approved: Record<string, never>;
};

/** On an existing (userId, groupKey) row: "refresh" updates data, marks it unread and pushes again; "skip" does nothing. */
export const ON_EXISTING: Record<NotificationKind, "refresh" | "skip"> = {
  announcement: "skip",
  week_published: "skip",
  fist_bump: "refresh",
  coach_deleted: "skip",
  athlete_joined: "skip",
  athlete_left: "skip",
  week_reminder: "skip",
  coach_approved: "skip",
};

type Translate = (key: string, values?: Record<string, string | number>) => string;

export function notificationHref<K extends NotificationKind>(kind: K, data: NotificationData[K]): string {
  const d = data as NotificationData[NotificationKind] & Record<string, string | number>;
  switch (kind as NotificationKind) {
    case "announcement": return `/programs/${d.programId}/board`;
    case "week_published": return `/?program=${d.programId}&date=${d.monday}`;
    case "fist_bump": return `/blocks/${d.blockId}/leaderboard`;
    case "coach_deleted": return `/?program=${d.programId}`;
    case "athlete_joined":
    case "athlete_left": return `/coach/programs/${d.programId}/athletes`;
    case "week_reminder": return `/coach/programs/${d.programId}?week=${d.weekIndex}`;
    case "coach_approved": return "/coach";
  }
}

/** `d MMM` in the translator's locale (message `notifications.locale`), without the trailing dot. */
function shortDate(iso: IsoDate, t: Translate): string {
  // A missing key or a namespaced translator yields the key path, which is not a valid locale: fall back to Spanish.
  const requested = t("notifications.locale");
  const locale = Intl.DateTimeFormat.supportedLocalesOf([requested].filter((l) => /^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(l))).length
    ? requested
    : "es";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00Z`))
    .replace(/\.$/, "");
}

/** Needs a root (un-namespaced) translator: keys are absolute, e.g. `notifications.kinds.<kind>.body`. */
export function notificationText<K extends NotificationKind>(kind: K, data: NotificationData[K], t: Translate): { title: string; body: string } {
  const key = (part: "title" | "body") => `notifications.kinds.${kind}.${part}`;
  const d = data as Record<string, unknown>;
  let values: Record<string, string | number> = {};
  switch (kind as NotificationKind) {
    case "announcement":
      values = { program: d.programName as string, excerpt: d.excerpt as string };
      break;
    case "week_published":
    case "week_reminder":
      values = { program: d.programName as string, date: shortDate(d.monday as IsoDate, t) };
      break;
    case "fist_bump":
      values = {
        name: d.latestName as string,
        others: Math.max(0, (d.count as number) - 1),
        block: blockLabel(d.block as LabelBlock, t),
      };
      break;
    case "coach_deleted":
      values = { program: d.programName as string };
      break;
    case "athlete_joined":
    case "athlete_left":
      values = { name: d.athleteName as string, program: d.programName as string };
      break;
    case "coach_approved":
      break;
  }
  return { title: t(key("title"), values), body: t(key("body"), values) };
}

/** First `max` code points on a single line; ends with "…" when cut. Cuts by code point so an emoji is never split (a lone surrogate is invalid JSON for Postgres). */
export function excerpt(body: string, max = 120): string {
  const chars = Array.from(body.replace(/\s+/g, " ").trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}
