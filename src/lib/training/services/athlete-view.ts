import { athleteTimeline } from "../access";
import { canLogDay, dateOfDay, dayIndexOf, daysBetween, isDayVisible, type IsoDate } from "../dates";
import { TrainingError } from "../errors";
import { publishedWeeks } from "./programs";
import type { Db } from "./types";

export async function loadAthleteTimeline(db: Db, athleteId: string, programId: string) {
  const enrollment = await db.enrollment.findFirst({
    where: { athleteId, programId, removedAt: null, program: { archivedAt: null } },
    include: { program: { include: { coach: true } } },
  });
  if (!enrollment) throw new TrainingError("not_found");
  const timeline = athleteTimeline(enrollment.program, enrollment, await publishedWeeks(db, programId));
  return { enrollment, program: enrollment.program, timeline };
}

export async function getAthleteDay(db: Db, athleteId: string, programId: string, date: IsoDate, today: IsoDate) {
  const { program, timeline } = await loadAthleteTimeline(db, athleteId, programId);
  const dayIndex = dayIndexOf(timeline, date);
  const empty = { program, timeline, dayIndex, loggable: false, blocks: [] };
  if (dayIndex === null) return { ...empty, status: date < timeline.startDate ? "before_start" as const : "finished" as const };
  if (!isDayVisible(timeline, dayIndex)) return { ...empty, status: "unpublished" as const };
  const blocks = await db.block.findMany({ where: { programId, dayIndex }, orderBy: { position: "asc" } });
  return { program, timeline, dayIndex, status: "ok" as const, loggable: canLogDay(timeline, dayIndex, today), blocks };
}

export type AthleteDay = Awaited<ReturnType<typeof getAthleteDay>>;

export async function getVisibleDays(db: Db, athleteId: string, programId: string, from: IsoDate, to: IsoDate) {
  const { timeline } = await loadAthleteTimeline(db, athleteId, programId);
  const groups = await db.block.groupBy({
    by: ["dayIndex"],
    where: { programId, dayIndex: { gte: Math.max(0, daysBetween(timeline.startDate, from)), lte: daysBetween(timeline.startDate, to) } },
  });
  return new Set(groups.filter((g) => isDayVisible(timeline, g.dayIndex)).map((g) => dateOfDay(timeline, g.dayIndex)));
}
