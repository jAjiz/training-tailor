import { todayIn, type IsoDate } from "../dates";
import { TrainingError } from "../errors";
import { assertWritable, getOwnedProgram } from "./programs";
import { getVisibleBlock } from "./results";
import type { Db } from "./types";

type TailoringProgram = {
  tailoringEnabled: boolean;
  archivedAt: Date | null;
  coach: { tailoringEnabled: boolean; status: string } | null;
};

/** Tailoring needs the coach's switch (set by an admin), the program's own, an approved coach and a live program. */
export function tailoringOn(program: TailoringProgram): boolean {
  return program.tailoringEnabled && program.archivedAt === null
    && program.coach !== null && program.coach.tailoringEnabled && program.coach.status === "approved";
}

/** Today and later days can be adapted; a day that has passed cannot. */
export function isAdaptableDay(date: IsoDate, today: IsoDate): boolean {
  return date >= today;
}

/** A block the athlete may see and adapt: visible, tailoring on, day not passed. */
export async function getAdaptableBlock(
  db: Db, athlete: { id: string; timezone: string }, blockId: string, now: Date = new Date(),
) {
  const { block, date } = await getVisibleBlock(db, athlete, blockId, now);
  const program = await db.program.findUniqueOrThrow({
    where: { id: block.programId }, include: { coach: { select: { tailoringEnabled: true, status: true } } },
  });
  if (!tailoringOn(program)) throw new TrainingError("tailoring_off");
  if (!isAdaptableDay(date, todayIn(athlete.timezone, now))) throw new TrainingError("day_passed");
  return { block: { ...block, program }, date };
}

/** Turning on needs the coach's switch; turning off is always allowed. */
export async function setProgramTailoring(db: Db, coachId: string, programId: string, enabled: boolean) {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  if (enabled) {
    const coach = await db.coachAccount.findUniqueOrThrow({ where: { id: coachId } });
    if (!coach.tailoringEnabled) throw new TrainingError("tailoring_not_allowed");
  }
  await db.program.update({ where: { id: programId }, data: { tailoringEnabled: enabled } });
}
