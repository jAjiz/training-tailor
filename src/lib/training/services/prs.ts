import { toDbDate, todayIn } from "../dates";
import { TrainingError } from "../errors";
import type { PrInputValue } from "../schemas";
import { currentOneRm, type OneRm } from "../records";
import { assertRecordFits, recordFieldsOf } from "./catalog";
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
  await assertRecordFits(db, input);
  if (input.achievedOn > todayIn(athlete.timezone, now)) throw new TrainingError("invalid_request");
  return db.personalRecord.create({
    data: { athleteId: athlete.id, movement: input.movement, achievedOn: toDbDate(input.achievedOn), ...recordFieldsOf(input) },
  });
}

export async function deletePr(db: Db, athleteId: string, prId: string) {
  const { count } = await db.personalRecord.deleteMany({ where: { id: prId, athleteId } });
  if (count === 0) throw new TrainingError("not_found");
}

/** Each lift's current 1RM: the best real single or Epley estimate over its `lift` rows. */
export async function oneRmMap(db: Db, athleteId: string, movements: string[]): Promise<Map<string, OneRm>> {
  if (movements.length === 0) return new Map();
  const rows = await db.personalRecord.findMany({
    where: { athleteId, kind: "lift", movement: { in: movements } },
    select: { movement: true, kg: true, reps: true, achievedOn: true },
  });
  return liftOneRms(rows);
}

/** Current 1RM per movement from `lift` rows (rows of other kinds are skipped). */
export function liftOneRms(
  rows: readonly { movement: string; kind?: string; kg: number | null; reps: number | null; achievedOn: Date }[],
): Map<string, OneRm> {
  const byMovement = new Map<string, { kg: number; reps: number; achievedOn: Date }[]>();
  for (const r of rows) {
    if ((r.kind ?? "lift") !== "lift" || r.kg === null || r.reps === null) continue;
    byMovement.set(r.movement, [...(byMovement.get(r.movement) ?? []), { kg: r.kg, reps: r.reps, achievedOn: r.achievedOn }]);
  }
  const out = new Map<string, OneRm>();
  for (const [movement, lifts] of byMovement) {
    const best = currentOneRm(lifts);
    if (best) out.set(movement, best);
  }
  return out;
}

/** The athlete's `lift` rows of one movement, as the record logic reads them. */
export async function liftRows(db: Db, athleteId: string, movement: string) {
  const rows = await db.personalRecord.findMany({ where: { athleteId, movement, kind: "lift" }, select: { kg: true, reps: true, achievedOn: true } });
  return rows.flatMap((r) => (r.kg !== null && r.reps !== null ? [{ kg: r.kg, reps: r.reps, achievedOn: r.achievedOn }] : []));
}
