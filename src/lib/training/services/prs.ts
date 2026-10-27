import { toDbDate, todayIn } from "../dates";
import { TrainingError } from "../errors";
import type { PrInputValue } from "../schemas";
import { assertLiftMovement } from "./catalog";
import type { Db } from "./types";

export function listPrs(db: Db, athleteId: string) {
  return db.personalRecord.findMany({
    where: { athleteId },
    orderBy: [{ movement: "asc" }, { achievedOn: "desc" }, { createdAt: "desc" }],
  });
}

export function listMovementPrs(db: Db, athleteId: string, movement: string) {
  return db.personalRecord.findMany({
    where: { athleteId, movement },
    orderBy: [{ achievedOn: "desc" }, { createdAt: "desc" }],
  });
}

export async function addPr(db: Db, athlete: { id: string; timezone: string }, input: PrInputValue, now: Date = new Date()) {
  await assertLiftMovement(db, input.movement);
  if (input.achievedOn > todayIn(athlete.timezone, now)) throw new TrainingError("invalid_request");
  return db.personalRecord.create({
    data: { athleteId: athlete.id, movement: input.movement, kg: input.kg, achievedOn: toDbDate(input.achievedOn) },
  });
}

export async function deletePr(db: Db, athleteId: string, prId: string) {
  const { count } = await db.personalRecord.deleteMany({ where: { id: prId, athleteId } });
  if (count === 0) throw new TrainingError("not_found");
}

export async function oneRmMap(db: Db, athleteId: string, movements: string[]): Promise<Map<string, number>> {
  if (movements.length === 0) return new Map();
  const rows = await db.personalRecord.groupBy({
    by: ["movement"], where: { athleteId, movement: { in: movements } }, _max: { kg: true },
  });
  return new Map(rows.filter((r) => r._max.kg !== null).map((r) => [r.movement, r._max.kg as number]));
}
