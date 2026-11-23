import { programAccess, type Access } from "../payments";
import type { DbOrTx } from "./types";

const PROGRAM_PRICING = { kind: true, priceAmount: true, paidSince: true } as const;
const PURCHASE_FIELDS = { kind: true, status: true } as const;

/** One query at a time: inside a transaction (the webhook's) they share a single connection. */
async function readAccessInputs(db: DbOrTx, programId: string, athleteId: string) {
  const program = await db.program.findUniqueOrThrow({ where: { id: programId }, select: PROGRAM_PRICING });
  const enrollment = await db.enrollment.findUnique({ where: { programId_athleteId: { programId, athleteId } } });
  const purchases = await db.programPurchase.findMany({ where: { programId, athleteId }, select: PURCHASE_FIELDS });
  return [program, enrollment, purchases] as const;
}

/** Recomputes the athlete's access to the program and stores it on the enrollment; without one, nothing is stored and it is `blocked`. */
export async function refreshAccess(db: DbOrTx, programId: string, athleteId: string): Promise<Access> {
  const [program, enrollment, purchases] = await readAccessInputs(db, programId, athleteId);
  if (!enrollment) return "blocked";
  const access = programAccess(program, enrollment, purchases);
  if (access !== enrollment.access) await db.enrollment.update({ where: { id: enrollment.id }, data: { access } });
  return access;
}

/** The access the athlete would have on joining (or rejoining) now: their enrollment's, or a new one's. Stores nothing. */
export async function accessOnJoin(db: DbOrTx, programId: string, athleteId: string, now: Date = new Date()): Promise<Access> {
  const [program, enrollment, purchases] = await readAccessInputs(db, programId, athleteId);
  return programAccess(program, enrollment ?? { joinedAt: now, accessGrantedAt: null }, purchases);
}

/** `refreshAccess` for every enrollment of the program, e.g. after a price change. */
export async function refreshProgramAccess(db: DbOrTx, programId: string): Promise<void> {
  // One query at a time, as in `readAccessInputs`: coach deletion runs this inside its transaction.
  const program = await db.program.findUniqueOrThrow({ where: { id: programId }, select: PROGRAM_PRICING });
  const enrollments = await db.enrollment.findMany({ where: { programId } });
  const purchases = await db.programPurchase.findMany({ where: { programId }, select: { ...PURCHASE_FIELDS, athleteId: true } });
  for (const e of enrollments) {
    const access = programAccess(program, e, purchases.filter((p) => p.athleteId === e.athleteId));
    if (access !== e.access) await db.enrollment.update({ where: { id: e.id }, data: { access } });
  }
}
