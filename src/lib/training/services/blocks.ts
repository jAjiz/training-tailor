import { Prisma, type Block } from "@/generated/prisma/client";
import { toJson } from "@/lib/json";
import { TrainingError } from "../errors";
import type { BlockInputValue } from "../schemas";
import { assertLiftMovement } from "./catalog";
import { assertWritable, getOwnedProgram } from "./programs";
import type { Db } from "./types";

type ProgramRange = { kind: string; weeks: number | null };

function assertDay(program: ProgramRange, dayIndex: number) {
  if (!Number.isInteger(dayIndex) || dayIndex < 0) throw new TrainingError("day_out_of_range");
  if (program.kind === "closed" && dayIndex >= (program.weeks ?? 0) * 7) throw new TrainingError("day_out_of_range");
}

/** Every column of a block, so switching kinds clears the other kind's fields. */
function columns(input: BlockInputValue) {
  const common = {
    kind: input.kind, title: input.title, color: input.color, coachingTips: input.coachingTips, videoUrl: input.videoUrl,
  };
  return input.kind === "custom"
    ? {
      ...common, description: input.description, scoring: input.scoring, timeCapSeconds: input.timeCapSeconds,
      movement: null, sets: Prisma.DbNull, instructions: null,
    }
    : {
      ...common, description: null, scoring: null, timeCapSeconds: null,
      movement: input.movement, sets: toJson(input.sets), instructions: input.instructions,
    };
}

function copyOf(b: Block) {
  return {
    kind: b.kind, title: b.title, color: b.color, coachingTips: b.coachingTips, videoUrl: b.videoUrl,
    description: b.description, scoring: b.scoring, timeCapSeconds: b.timeCapSeconds, movement: b.movement,
    sets: b.sets === null ? Prisma.DbNull : (b.sets as Prisma.InputJsonValue), instructions: b.instructions,
  };
}

async function getOwnedBlock(db: Db, coachId: string, blockId: string) {
  const block = await db.block.findFirst({
    where: { id: blockId, program: { coachId } },
    include: { program: true, _count: { select: { results: true } } },
  });
  if (!block) throw new TrainingError("not_found");
  assertWritable(block.program);
  return block;
}

async function writableProgram(db: Db, coachId: string, programId: string) {
  const program = await getOwnedProgram(db, coachId, programId);
  assertWritable(program);
  return program;
}

const nextPosition = (db: Db, programId: string, dayIndex: number) => db.block.count({ where: { programId, dayIndex } });

export function listWeekBlocks(db: Db, programId: string, weekIndex: number) {
  return db.block.findMany({
    where: { programId, dayIndex: { gte: weekIndex * 7, lt: weekIndex * 7 + 7 } },
    orderBy: [{ dayIndex: "asc" }, { position: "asc" }],
    include: { _count: { select: { results: true } } },
  });
}

export async function createBlock(db: Db, coachId: string, programId: string, dayIndex: number, input: BlockInputValue) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, dayIndex);
  if (input.kind === "barbell") await assertLiftMovement(input.movement);
  return db.block.create({
    data: { programId, dayIndex, position: await nextPosition(db, programId, dayIndex), ...columns(input) },
  });
}

export async function updateBlock(db: Db, coachId: string, blockId: string, input: BlockInputValue) {
  const block = await getOwnedBlock(db, coachId, blockId);
  const scoringChanged = input.kind !== block.kind || (input.kind === "custom" && input.scoring !== block.scoring);
  if (block._count.results > 0 && scoringChanged) throw new TrainingError("scoring_locked");
  if (input.kind === "barbell") await assertLiftMovement(input.movement);
  return db.block.update({ where: { id: blockId }, data: columns(input) });
}

export async function deleteBlock(db: Db, coachId: string, blockId: string) {
  const block = await getOwnedBlock(db, coachId, blockId);
  await db.$transaction([
    db.block.delete({ where: { id: blockId } }),
    db.block.updateMany({
      where: { programId: block.programId, dayIndex: block.dayIndex, position: { gt: block.position } },
      data: { position: { decrement: 1 } },
    }),
  ]);
}

/** Drag and drop: `toPosition` is the block's final index in the target day (clamped). */
export async function moveBlock(db: Db, coachId: string, blockId: string, toDayIndex: number, toPosition: number) {
  const block = await getOwnedBlock(db, coachId, blockId);
  assertDay(block.program, toDayIndex);
  const { programId } = block;
  await db.$transaction(async (tx) => {
    // Close the gap in the source day, then open one in the target day.
    await tx.block.updateMany({
      where: { programId, dayIndex: block.dayIndex, position: { gt: block.position } },
      data: { position: { decrement: 1 } },
    });
    const others = await tx.block.count({ where: { programId, dayIndex: toDayIndex, id: { not: blockId } } });
    const position = Math.max(0, Math.min(toPosition, others));
    await tx.block.updateMany({
      where: { programId, dayIndex: toDayIndex, id: { not: blockId }, position: { gte: position } },
      data: { position: { increment: 1 } },
    });
    await tx.block.update({ where: { id: blockId }, data: { dayIndex: toDayIndex, position } });
  });
}

export async function duplicateBlock(db: Db, coachId: string, blockId: string, targetDayIndex: number) {
  const block = await getOwnedBlock(db, coachId, blockId);
  assertDay(block.program, targetDayIndex);
  await db.block.create({
    data: {
      programId: block.programId, dayIndex: targetDayIndex,
      position: await nextPosition(db, block.programId, targetDayIndex), ...copyOf(block),
    },
  });
}

/** Appends `blocks` (already ordered) to the day `toDay(block)`, after what is there. */
async function appendCopies(db: Db, programId: string, blocks: Block[], toDay: (b: Block) => number) {
  const positions = new Map<number, number>();
  const data = [];
  for (const b of blocks) {
    const day = toDay(b);
    const position = positions.get(day) ?? (await nextPosition(db, programId, day));
    positions.set(day, position + 1);
    data.push({ programId, dayIndex: day, position, ...copyOf(b) });
  }
  if (data.length) await db.block.createMany({ data });
}

export async function duplicateDay(db: Db, coachId: string, programId: string, fromDay: number, toDay: number) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, fromDay);
  assertDay(program, toDay);
  const blocks = await db.block.findMany({ where: { programId, dayIndex: fromDay }, orderBy: { position: "asc" } });
  await appendCopies(db, programId, blocks, () => toDay);
}

export async function duplicateWeek(db: Db, coachId: string, programId: string, fromWeek: number, toWeek: number) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, fromWeek * 7);
  assertDay(program, toWeek * 7 + 6);
  const blocks = await db.block.findMany({
    where: { programId, dayIndex: { gte: fromWeek * 7, lt: fromWeek * 7 + 7 } },
    orderBy: [{ dayIndex: "asc" }, { position: "asc" }],
  });
  await appendCopies(db, programId, blocks, (b) => toWeek * 7 + (b.dayIndex - fromWeek * 7));
}
