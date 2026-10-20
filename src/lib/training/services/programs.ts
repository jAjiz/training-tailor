import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { intent, type NotificationIntent } from "@/lib/notifications/notify";
import { addDays, fromDbDate, toDbDate } from "../dates";
import { TrainingError } from "../errors";
import type { ProgramCreate, ProgramUpdate } from "../schemas";
import { activeAthleteRecipients } from "./notifications";
import type { Db } from "./types";

export function newInviteCode(): string {
  return randomBytes(6).toString("base64url"); // 8 URL-safe characters
}

export async function createProgram(db: Db, coachId: string, input: ProgramCreate) {
  const coach = await db.coachAccount.findUniqueOrThrow({ where: { id: coachId } });
  return db.program.create({
    data: {
      coachId,
      coachName: coach.displayName,
      name: input.name,
      description: input.description,
      kind: input.kind,
      startDate: input.kind === "continuous" ? toDbDate(input.startDate) : null,
      weeks: input.kind === "closed" ? input.weeks : null,
      inviteCode: newInviteCode(),
    },
  });
}

export function listCoachPrograms(db: Db, coachId: string) {
  return db.program.findMany({
    where: { coachId },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    include: { _count: { select: { enrollments: { where: { removedAt: null, leftAt: null } } } } },
  });
}

export async function getOwnedProgram(db: Db, coachId: string, programId: string) {
  const program = await db.program.findFirst({ where: { id: programId, coachId } });
  if (!program) throw new TrainingError("not_found");
  return program;
}

export function assertWritable(program: { archivedAt: Date | null }) {
  if (program.archivedAt) throw new TrainingError("program_archived");
}

export async function updateProgram(db: Db, coachId: string, programId: string, input: ProgramUpdate) {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  const data: Prisma.ProgramUpdateInput = { name: input.name, description: input.description };
  if (program.kind === "continuous" && input.startDate && input.startDate !== fromDbDate(program.startDate as Date)) {
    if ((await db.programWeek.count({ where: { programId } })) > 0) throw new TrainingError("start_date_locked");
    data.startDate = toDbDate(input.startDate);
  }
  if (program.kind === "closed" && input.weeks !== undefined && input.weeks !== program.weeks) {
    const outside = await db.block.count({ where: { programId, dayIndex: { gte: input.weeks * 7 } } });
    if (outside > 0) throw new TrainingError("weeks_out_of_range");
    data.weeks = input.weeks;
  }
  return db.program.update({ where: { id: programId }, data });
}

export async function archiveProgram(db: Db, coachId: string, programId: string) {
  await getOwnedProgram(db, coachId, programId);
  await db.program.update({ where: { id: programId }, data: { archivedAt: new Date() } });
}

export async function regenerateInvite(db: Db, coachId: string, programId: string) {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  if (program.inviteDisabledAt) throw new TrainingError("invite_disabled");
  const code = newInviteCode();
  await db.program.update({ where: { id: programId }, data: { inviteCode: code } });
  return code;
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

/** Publishes or unpublishes a week. The first publication of a week with blocks returns a `week_published` intent (else `[]`). */
export async function setWeekPublished(
  db: Db, coachId: string, programId: string, weekIndex: number, published: boolean,
): Promise<NotificationIntent[]> {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  if (program.kind !== "continuous" || !program.startDate || !Number.isInteger(weekIndex) || weekIndex < 0) {
    throw new TrainingError("invalid_request");
  }
  if (!published) {
    await db.programWeek.deleteMany({ where: { programId, weekIndex } });
    return [];
  }
  await db.programWeek.upsert({
    where: { programId_weekIndex: { programId, weekIndex } },
    create: { programId, weekIndex },
    update: {},
  });
  // An empty week does not count as the first time.
  if ((await db.block.count({ where: { programId, dayIndex: { gte: weekIndex * 7, lt: weekIndex * 7 + 7 } } })) === 0) return [];
  try {
    await db.weekNotice.create({ data: { programId, weekIndex } });
  } catch (e) {
    if (isUniqueViolation(e)) return []; // already notified
    throw e;
  }
  const coach = await db.coachAccount.findUniqueOrThrow({ where: { id: coachId }, select: { userId: true } });
  const recipients = await activeAthleteRecipients(db, programId, coach.userId);
  if (recipients.length === 0) return [];
  const monday = addDays(fromDbDate(program.startDate), weekIndex * 7);
  return [intent("week_published", recipients, { programId, programName: program.name, monday }, { programId })];
}

export async function setProgramPublished(db: Db, coachId: string, programId: string, published: boolean) {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  if (program.kind !== "closed") throw new TrainingError("invalid_request");
  await db.program.update({ where: { id: programId }, data: { publishedAt: published ? new Date() : null } });
}

export async function publishedWeeks(db: Db, programId: string): Promise<Set<number>> {
  const rows = await db.programWeek.findMany({ where: { programId }, select: { weekIndex: true } });
  return new Set(rows.map((r) => r.weekIndex));
}
