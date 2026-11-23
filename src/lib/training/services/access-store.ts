import { programAccess, type Access } from "../payments";
import type { DbOrTx } from "./types";

const PROGRAM_PRICING = { kind: true, priceAmount: true, paidSince: true } as const;
const PURCHASE_FIELDS = { kind: true, status: true } as const;

/** Recomputes the athlete's access to the program and stores it on the enrollment; without one, nothing is stored and it is `blocked`. */
export async function refreshAccess(db: DbOrTx, programId: string, athleteId: string): Promise<Access> {
  const [program, enrollment, purchases] = await Promise.all([
    db.program.findUniqueOrThrow({ where: { id: programId }, select: PROGRAM_PRICING }),
    db.enrollment.findUnique({ where: { programId_athleteId: { programId, athleteId } } }),
    db.programPurchase.findMany({ where: { programId, athleteId }, select: PURCHASE_FIELDS }),
  ]);
  if (!enrollment) return "blocked";
  const access = programAccess(program, enrollment, purchases);
  if (access !== enrollment.access) await db.enrollment.update({ where: { id: enrollment.id }, data: { access } });
  return access;
}

/** `refreshAccess` for every enrollment of the program, e.g. after a price change. */
export async function refreshProgramAccess(db: DbOrTx, programId: string): Promise<void> {
  const [program, enrollments, purchases] = await Promise.all([
    db.program.findUniqueOrThrow({ where: { id: programId }, select: PROGRAM_PRICING }),
    db.enrollment.findMany({ where: { programId } }),
    db.programPurchase.findMany({ where: { programId }, select: { ...PURCHASE_FIELDS, athleteId: true } }),
  ]);
  for (const e of enrollments) {
    const access = programAccess(program, e, purchases.filter((p) => p.athleteId === e.athleteId));
    if (access !== e.access) await db.enrollment.update({ where: { id: e.id }, data: { access } });
  }
}
