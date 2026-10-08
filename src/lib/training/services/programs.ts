import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { fromDbDate, toDbDate } from "../dates";
import { TrainingError } from "../errors";
import type { ProgramCreate, ProgramUpdate } from "../schemas";
import type { Db } from "./types";

export function newInviteCode(): string {
  return randomBytes(6).toString("base64url"); // 8 URL-safe characters
}

export async function createProgram(db: Db, coachId: string, input: ProgramCreate) {
  return db.program.create({
    data: {
      coachId,
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
    include: { _count: { select: { enrollments: { where: { removedAt: null } } } } },
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
  const code = newInviteCode();
  await db.program.update({ where: { id: programId }, data: { inviteCode: code } });
  return code;
}

export async function setWeekPublished(db: Db, coachId: string, programId: string, weekIndex: number, published: boolean) {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  if (program.kind !== "continuous" || !Number.isInteger(weekIndex) || weekIndex < 0) {
    throw new TrainingError("invalid_request");
  }
  if (published) {
    await db.programWeek.upsert({
      where: { programId_weekIndex: { programId, weekIndex } },
      create: { programId, weekIndex },
      update: {},
    });
  } else {
    await db.programWeek.deleteMany({ where: { programId, weekIndex } });
  }
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
