import { toDbDate, todayIn } from "../dates";
import { TrainingError } from "../errors";
import { getOwnedProgram } from "./programs";
import type { Db } from "./types";

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

export async function findProgramByCode(db: Db, code: string) {
  const program = await db.program.findUnique({ where: { inviteCode: code }, include: { coach: true } });
  if (!program || program.archivedAt || (program.kind === "closed" && !program.publishedAt)) return null;
  return program;
}

export async function joinByCode(db: Db, athlete: { id: string; timezone: string }, code: string, now: Date = new Date()) {
  const program = await findProgramByCode(db, code);
  if (!program) throw new TrainingError("invite_invalid");
  const existing = await db.enrollment.findUnique({
    where: { programId_athleteId: { programId: program.id, athleteId: athlete.id } },
  });
  if (existing) {
    if (existing.removedAt) throw new TrainingError("enrollment_removed");
    return { programId: program.id, status: "already" as const };
  }
  try {
    await db.enrollment.create({
      data: {
        programId: program.id,
        athleteId: athlete.id,
        startDate: program.kind === "closed" ? toDbDate(todayIn(athlete.timezone, now)) : null,
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { programId: program.id, status: "already" as const }; // double click
    throw e;
  }
  return { programId: program.id, status: "joined" as const };
}

export async function getEnrollmentStatus(db: Db, athleteId: string, programId: string) {
  const e = await db.enrollment.findUnique({ where: { programId_athleteId: { programId, athleteId } } });
  if (!e) return null;
  return e.removedAt ? ("removed" as const) : ("active" as const);
}

export async function listRoster(db: Db, coachId: string, programId: string) {
  await getOwnedProgram(db, coachId, programId);
  return db.enrollment.findMany({ where: { programId }, include: { athlete: true }, orderBy: { joinedAt: "asc" } });
}

export async function setEnrollmentRemoved(db: Db, coachId: string, enrollmentId: string, removed: boolean) {
  const e = await db.enrollment.findFirst({ where: { id: enrollmentId, program: { coachId } } });
  if (!e) throw new TrainingError("not_found");
  await db.enrollment.update({ where: { id: enrollmentId }, data: { removedAt: removed ? new Date() : null } });
}

export function listAthletePrograms(db: Db, athleteId: string) {
  return db.enrollment.findMany({
    where: { athleteId, removedAt: null, program: { archivedAt: null } },
    include: { program: { include: { coach: true } } },
    orderBy: { joinedAt: "desc" },
  });
}
