import { athleteTimeline } from "../access";
import { canLogDay, dateOfDay, dayIndexOf, daysBetween, isDayVisible, type IsoDate } from "../dates";
import { TrainingError } from "../errors";
import { publishedWeeks } from "./programs";
import type { Db } from "./types";

export async function loadAthleteTimeline(db: Db, athleteId: string, programId: string) {
  const enrollment = await db.enrollment.findFirst({
    where: { athleteId, programId, removedAt: null, leftAt: null, program: { archivedAt: null } },
    include: { program: { include: { coach: true } } },
  });
  if (!enrollment) throw new TrainingError("not_found");
  const timeline = athleteTimeline(enrollment.program, enrollment, await publishedWeeks(db, programId));
  return { enrollment, program: enrollment.program, timeline };
}

export async function getAthleteDay(db: Db, athleteId: string, programId: string, date: IsoDate, today: IsoDate) {
  const { program, timeline } = await loadAthleteTimeline(db, athleteId, programId);
  const dayIndex = dayIndexOf(timeline, date);
  const empty = { program, timeline, dayIndex, loggable: false, blocks: [], note: null };
  if (dayIndex === null) return { ...empty, status: date < timeline.startDate ? "before_start" as const : "finished" as const };
  if (!isDayVisible(timeline, dayIndex)) return { ...empty, status: "unpublished" as const };
  const blocks = await db.block.findMany({ where: { programId, dayIndex }, orderBy: { position: "asc" } });
  const note = await db.dayNote.findUnique({ where: { programId_dayIndex: { programId, dayIndex } } });
  return { program, timeline, dayIndex, status: "ok" as const, loggable: canLogDay(timeline, dayIndex, today), blocks, note: note?.body ?? null };
}

/** The note of the program week containing dayIndex, once that week is visible. */
export async function getAthleteWeekNote(db: Db, athleteId: string, programId: string, dayIndex: number): Promise<string | null> {
  const { timeline } = await loadAthleteTimeline(db, athleteId, programId);
  const weekIndex = Math.floor(dayIndex / 7);
  if (!isDayVisible(timeline, weekIndex * 7)) return null;
  const note = await db.weekNote.findUnique({ where: { programId_weekIndex: { programId, weekIndex } } });
  return note?.body ?? null;
}

export type AthleteDay = Awaited<ReturnType<typeof getAthleteDay>>;

export async function getVisibleDays(db: Db, athleteId: string, programId: string, from: IsoDate, to: IsoDate) {
  const { timeline } = await loadAthleteTimeline(db, athleteId, programId);
  const range = { gte: Math.max(0, daysBetween(timeline.startDate, from)), lte: daysBetween(timeline.startDate, to) };
  const [groups, notes] = await Promise.all([
    db.block.groupBy({ by: ["dayIndex"], where: { programId, dayIndex: range } }),
    db.dayNote.findMany({ where: { programId, dayIndex: range }, select: { dayIndex: true } }),
  ]);
  const indexes = new Set([...groups, ...notes].map((g) => g.dayIndex));
  return new Set([...indexes].filter((i) => isDayVisible(timeline, i)).map((i) => dateOfDay(timeline, i)));
}
