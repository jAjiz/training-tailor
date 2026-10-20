import { inviteCodeFromNext, type SignupMode } from "@/lib/signup";
import { toDbDate, todayIn } from "../dates";
import { TrainingError } from "../errors";
import { intent, type NotificationIntent } from "@/lib/notifications/notify";
import { coachRecipient } from "./notifications";
import { getOwnedProgram } from "./programs";
import type { Db } from "./types";

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

export async function findProgramByCode(db: Db, code: string) {
  const program = await db.program.findUnique({ where: { inviteCode: code }, include: { coach: true } });
  if (!program || program.archivedAt || (program.kind === "closed" && !program.publishedAt)) return null;
  if (program.coach?.status !== "approved" || program.inviteDisabledAt) return null;
  return program;
}

/** The sign-up gate: an athlete profile may be created when one exists already, sign-up is open, or `next` is `/join/<a joinable code>`. */
export async function canCreateAthleteProfile(db: Db, userId: string, next: string, mode: SignupMode): Promise<boolean> {
  if (await db.athleteAccount.findUnique({ where: { userId }, select: { id: true } })) return true;
  if (mode === "open") return true;
  const code = inviteCodeFromNext(next);
  return code !== null && (await findProgramByCode(db, code)) !== null;
}

type JoiningAthlete = { id: string; timezone: string; userId: string; displayName: string };

/** `joined` and `rejoined` carry one `athlete_joined` intent for the coach (none for the coach's own account). */
export async function joinByCode(db: Db, athlete: JoiningAthlete, code: string, now: Date = new Date()) {
  const program = await findProgramByCode(db, code);
  if (!program) throw new TrainingError("invite_invalid");
  const joinedIntents = () => [
    intent("athlete_joined", coachRecipient(program, athlete.userId), {
      programId: program.id, programName: program.name, athleteName: athlete.displayName,
    }),
  ].filter((i) => i.recipients.length > 0);
  const existing = await db.enrollment.findUnique({
    where: { programId_athleteId: { programId: program.id, athleteId: athlete.id } },
  });
  if (existing) {
    if (existing.removedAt) throw new TrainingError("enrollment_removed");
    if (existing.leftAt) {
      const { count } = await db.enrollment.updateMany({ where: { id: existing.id, leftAt: { not: null } }, data: { leftAt: null } });
      return { programId: program.id, status: (count > 0 ? "rejoined" : "already") as "rejoined" | "already", intents: count > 0 ? joinedIntents() : [] };
    }
    return { programId: program.id, status: "already" as const, intents: [] as NotificationIntent[] };
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
    if (isUniqueViolation(e)) return { programId: program.id, status: "already" as const, intents: [] as NotificationIntent[] }; // double click
    throw e;
  }
  return { programId: program.id, status: "joined" as const, intents: joinedIntents() };
}

/** The athlete steps out of a program; results and `joinedAt` stay, and the invitation link brings them back. */
export async function leaveProgram(
  db: Db, athlete: { id: string; userId: string; displayName: string }, programId: string,
): Promise<NotificationIntent[]> {
  const { count } = await db.enrollment.updateMany({
    where: { programId, athleteId: athlete.id, removedAt: null, leftAt: null },
    data: { leftAt: new Date() },
  });
  if (count === 0) throw new TrainingError("not_enrolled");
  const program = await db.program.findUniqueOrThrow({ where: { id: programId }, include: { coach: true } });
  return [
    intent("athlete_left", coachRecipient(program, athlete.userId), {
      programId, programName: program.name, athleteName: athlete.displayName,
    }),
  ].filter((i) => i.recipients.length > 0);
}

export async function getEnrollmentStatus(db: Db, athleteId: string, programId: string) {
  const e = await db.enrollment.findUnique({ where: { programId_athleteId: { programId, athleteId } } });
  if (!e) return null;
  if (e.removedAt) return "removed" as const;
  return e.leftAt ? ("left" as const) : ("active" as const);
}

/** The athlete's enrollment status in the program a block belongs to (null: unknown block or never enrolled), for dead inbox links. */
export async function getBlockEnrollmentStatus(db: Db, athleteId: string, blockId: string) {
  const block = await db.block.findUnique({ where: { id: blockId }, select: { programId: true } });
  if (!block) return null;
  const status = await getEnrollmentStatus(db, athleteId, block.programId);
  return status && { programId: block.programId, status };
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
    where: { athleteId, removedAt: null, leftAt: null, program: { archivedAt: null } },
    include: { program: { include: { coach: true } } },
    orderBy: { joinedAt: "desc" },
  });
}
