import { inviteCodeFromNext, type SignupMode } from "@/lib/signup";
import { toDbDate, todayIn } from "../dates";
import { TrainingError } from "../errors";
import { intent, type NotificationIntent } from "@/lib/notifications/notify";
import { accessOnJoin } from "./access-store";
import { coachRecipient } from "./notifications";
import { getOwnedProgram } from "./programs";
import type { Db, DbOrTx } from "./types";

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

type JoinableFields = {
  archivedAt: Date | null; kind: string; publishedAt: Date | null; inviteDisabledAt: Date | null;
  coach: { status: string } | null;
};

/** Whether the program's invitation lets a new athlete in: live, published if closed, coach approved, invite on. */
export function isJoinable(program: JoinableFields): boolean {
  if (program.archivedAt || (program.kind === "closed" && !program.publishedAt)) return false;
  return program.coach?.status === "approved" && !program.inviteDisabledAt;
}

export async function findProgramByCode(db: Db, code: string) {
  const program = await db.program.findUnique({ where: { inviteCode: code }, include: { coach: true } });
  return program && isJoinable(program) ? program : null;
}

/** The sign-up gate: an athlete profile may be created when one exists already, sign-up is open, or `next` is `/join/<a joinable code>`. */
export async function canCreateAthleteProfile(db: Db, userId: string, next: string, mode: SignupMode): Promise<boolean> {
  if (await db.athleteAccount.findUnique({ where: { userId }, select: { id: true } })) return true;
  if (mode === "open") return true;
  const code = inviteCodeFromNext(next);
  return code !== null && (await findProgramByCode(db, code)) !== null;
}

type JoiningAthlete = { id: string; timezone: string; userId: string; displayName: string };
type ProgramWithCoach = {
  id: string; name: string; coach: { userId: string; status: string; locale: string | null } | null;
};

/** The `athlete_joined` intent for the coach of a program the athlete joined or rejoined (none for the coach's own account). */
export function athleteJoinedIntents(
  program: ProgramWithCoach, athlete: { userId: string; displayName: string },
): NotificationIntent[] {
  return [
    intent("athlete_joined", coachRecipient(program, athlete.userId), {
      programId: program.id, programName: program.name, athleteName: athlete.displayName,
    }),
  ].filter((i) => i.recipients.length > 0);
}

/**
 * Brings in an athlete who is not active in the program: creates the enrollment (closed: starting today in the
 * athlete's time zone) or clears `leftAt` of the left one (`startDate` and `joinedAt` stay). `already` when a
 * concurrent call got there first. Removed and active enrollments are the caller's to handle.
 */
export async function enterProgram(
  db: DbOrTx, program: { id: string; kind: string }, athlete: { id: string; timezone: string },
  left: { id: string } | null, now: Date,
): Promise<"joined" | "rejoined" | "already"> {
  if (left) {
    const { count } = await db.enrollment.updateMany({ where: { id: left.id, leftAt: { not: null } }, data: { leftAt: null } });
    return count > 0 ? "rejoined" : "already";
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
    if (isUniqueViolation(e)) return "already"; // double click
    throw e;
  }
  return "joined";
}

/** `joined` and `rejoined` carry one `athlete_joined` intent for the coach (none for the coach's own account). */
export async function joinByCode(db: Db, athlete: JoiningAthlete, code: string, now: Date = new Date()) {
  const program = await findProgramByCode(db, code);
  if (!program) throw new TrainingError("invite_invalid");
  const existing = await db.enrollment.findUnique({
    where: { programId_athleteId: { programId: program.id, athleteId: athlete.id } },
  });
  if (existing?.removedAt) throw new TrainingError("enrollment_removed");
  if (existing && !existing.leftAt) {
    return { programId: program.id, status: "already" as const, intents: [] as NotificationIntent[] };
  }
  // A paid program is joined by paying (the webhook enrolls); only an athlete who keeps access joins here.
  if (program.priceAmount !== null && (await accessOnJoin(db, program.id, athlete.id, now)) === "blocked") {
    throw new TrainingError("payment_required");
  }
  const status = await enterProgram(db, program, athlete, existing, now);
  return { programId: program.id, status, intents: status === "already" ? [] : athleteJoinedIntents(program, athlete) };
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
  if (e.leftAt) return "left" as const;
  return e.access === "blocked" ? ("blocked" as const) : ("active" as const);
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

/** The athlete's active programs, blocked ones included (`access` tells them apart). */
export function listAthletePrograms(db: Db, athleteId: string) {
  return db.enrollment.findMany({
    where: { athleteId, removedAt: null, leftAt: null, program: { archivedAt: null } },
    include: { program: { include: { coach: true } } },
    orderBy: { joinedAt: "desc" },
  });
}
