import { isValidTimeZone } from "../dates";
import type { AthleteSettings } from "../schemas";
import type { Db } from "./types";

type AppLocale = "es" | "en";

export async function ensureAthleteAccount(
  db: Db, user: { id: string; name: string; image: string | null }, opts: { timezone: string; locale: AppLocale },
) {
  return db.athleteAccount.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      displayName: user.name.trim().slice(0, 60) || "Athlete",
      avatarUrl: user.image,
      timezone: isValidTimeZone(opts.timezone) ? opts.timezone : "UTC",
      locale: opts.locale,
    },
  });
}

export async function ensureCoachAccount(db: Db, user: { id: string; name: string }, opts: { locale: AppLocale }) {
  return db.coachAccount.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, displayName: user.name.trim().slice(0, 60) || "Coach", locale: opts.locale },
  });
}

export async function approveCoach(db: Db, email: string): Promise<"approved" | "not_found"> {
  const user = await db.user.findUnique({ where: { email }, include: { coachAccount: true } });
  if (!user?.coachAccount) return "not_found";
  await db.coachAccount.update({ where: { id: user.coachAccount.id }, data: { status: "approved" } });
  return "approved";
}

export async function updateAthleteSettings(db: Db, athleteId: string, s: AthleteSettings) {
  return db.athleteAccount.update({
    where: { id: athleteId },
    data: { displayName: s.displayName, timezone: s.timezone, locale: s.locale },
  });
}

export function getAthleteByUserId(db: Db, userId: string) {
  return db.athleteAccount.findUnique({ where: { userId } });
}

export function getCoachByUserId(db: Db, userId: string) {
  return db.coachAccount.findUnique({ where: { userId } });
}
