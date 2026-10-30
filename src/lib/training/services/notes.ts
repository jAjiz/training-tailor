import { assertDay, writableProgram } from "./blocks";
import type { Db, DbOrTx } from "./types";

/** Coach notes on a day or a week. A null body deletes the note. */
export async function setDayNote(db: Db, coachId: string, programId: string, dayIndex: number, body: string | null) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, dayIndex);
  if (body === null) await db.dayNote.deleteMany({ where: { programId, dayIndex } });
  else await db.dayNote.upsert({ where: { programId_dayIndex: { programId, dayIndex } }, create: { programId, dayIndex, body }, update: { body } });
}

export async function setWeekNote(db: Db, coachId: string, programId: string, weekIndex: number, body: string | null) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, weekIndex * 7);
  if (body === null) await db.weekNote.deleteMany({ where: { programId, weekIndex } });
  else await db.weekNote.upsert({ where: { programId_weekIndex: { programId, weekIndex } }, create: { programId, weekIndex, body }, update: { body } });
}

/** The week's note and its days' notes (keyed by dayIndex). */
export async function listWeekNotes(db: Db | DbOrTx, programId: string, weekIndex: number) {
  const [week, days] = await Promise.all([
    db.weekNote.findUnique({ where: { programId_weekIndex: { programId, weekIndex } } }),
    db.dayNote.findMany({ where: { programId, dayIndex: { gte: weekIndex * 7, lt: weekIndex * 7 + 7 } } }),
  ]);
  return { week: week?.body ?? null, days: new Map(days.map((d) => [d.dayIndex, d.body])) };
}
