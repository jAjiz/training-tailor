import { Prisma, type Block } from "@/generated/prisma/client";
import { toJson } from "@/lib/json";
import { TrainingError } from "../errors";
import type { BlockInputValue } from "../schemas";
import { assertLiftMovement } from "./catalog";
import { assertWritable, getOwnedProgram } from "./programs";
import type { Db, DbOrTx } from "./types";

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

const nextPosition = (db: DbOrTx, programId: string, dayIndex: number) => db.block.count({ where: { programId, dayIndex } });

/** `_count.results` counts every result (scoring lock, delete warning); `visibleResultCount` skips disabled athletes (badge). */
export async function listWeekBlocks(db: Db, programId: string, weekIndex: number) {
  const blocks = await db.block.findMany({
    where: { programId, dayIndex: { gte: weekIndex * 7, lt: weekIndex * 7 + 7 } },
    orderBy: [{ dayIndex: "asc" }, { position: "asc" }],
    include: { _count: { select: { results: true } } },
  });
  const visible = await db.result.groupBy({
    by: ["blockId"],
    where: { blockId: { in: blocks.map((b) => b.id) }, athlete: { disabledAt: null } },
    _count: { _all: true },
  });
  const visibleByBlock = new Map(visible.map((v) => [v.blockId, v._count._all]));
  return blocks.map((b) => ({ ...b, visibleResultCount: visibleByBlock.get(b.id) ?? 0 }));
}

export async function createBlock(db: Db, coachId: string, programId: string, dayIndex: number, input: BlockInputValue) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, dayIndex);
  if (input.kind === "barbell") await assertLiftMovement(db, input.movement);
  return db.block.create({
    data: { programId, dayIndex, position: await nextPosition(db, programId, dayIndex), ...columns(input) },
  });
}

export async function updateBlock(db: Db, coachId: string, blockId: string, input: BlockInputValue) {
  const block = await getOwnedBlock(db, coachId, blockId);
  // The time cap is part of the scoring: existing results were validated (and capped) against it.
  const scoringChanged = input.kind !== block.kind
    || (input.kind === "custom" && (input.scoring !== block.scoring || input.timeCapSeconds !== block.timeCapSeconds));
  if (block._count.results > 0 && scoringChanged) throw new TrainingError("scoring_locked");
  if (input.kind === "barbell") await assertLiftMovement(db, input.movement);
  return db.block.update({ where: { id: blockId }, data: columns(input) });
}

export async function deleteBlock(db: Db, coachId: string, blockId: string) {
  const block = await getOwnedBlock(db, coachId, blockId);
  await db.$transaction(async (tx) => {
    // Results cascade away with the block; so must their grouped fist-bump entries (entityId is the resultId).
    const results = await tx.result.findMany({ where: { blockId }, select: { id: true } });
    await tx.notification.deleteMany({ where: { kind: "fist_bump", entityId: { in: results.map((r) => r.id) } } });
    await tx.block.delete({ where: { id: blockId } });
    await tx.block.updateMany({
      where: { programId: block.programId, dayIndex: block.dayIndex, position: { gt: block.position } },
      data: { position: { decrement: 1 } },
    });
  });
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

/** Appends `entries` (already ordered) to their days, after what is there, in one statement: all or nothing. */
async function appendAll(db: DbOrTx, programId: string, entries: { dayIndex: number; columns: ReturnType<typeof copyOf> }[]) {
  const positions = new Map<number, number>();
  const data = [];
  for (const { dayIndex, columns } of entries) {
    const position = positions.get(dayIndex) ?? (await nextPosition(db, programId, dayIndex));
    positions.set(dayIndex, position + 1);
    data.push({ programId, dayIndex, position, ...columns });
  }
  if (data.length) await db.block.createMany({ data });
}

const appendCopies = (db: Db, programId: string, blocks: Block[], toDay: (b: Block) => number) =>
  appendAll(db, programId, blocks.map((b) => ({ dayIndex: toDay(b), columns: copyOf(b) })));

export type ImportItem = { dayIndex: number; block: BlockInputValue };
export type ImportMode = "append" | "replace";

/**
 * Creates the selected translated blocks in one transaction; returns how many. "append" puts them after
 * what is already in their days. "replace" first deletes every block of each week that receives one
 * (results go with them, as with deleteBlock); weeks receiving nothing are not touched.
 */
export async function importBlocks(db: Db, coachId: string, programId: string, items: ImportItem[], mode: ImportMode = "append") {
  const program = await writableProgram(db, coachId, programId);
  for (const { dayIndex } of items) assertDay(program, dayIndex);
  const lifts = new Set(items.flatMap(({ block }) => (block.kind === "barbell" ? [block.movement] : [])));
  for (const movement of lifts) await assertLiftMovement(db, movement);
  await db.$transaction(async (tx) => {
    if (mode === "replace") {
      const weeks = [...new Set(items.map(({ dayIndex }) => Math.floor(dayIndex / 7)))];
      const where = { programId, OR: weeks.map((w) => ({ dayIndex: { gte: w * 7, lt: w * 7 + 7 } })) };
      const results = await tx.result.findMany({ where: { block: where }, select: { id: true } });
      await tx.notification.deleteMany({ where: { kind: "fist_bump", entityId: { in: results.map((r) => r.id) } } });
      await tx.block.deleteMany({ where });
    }
    await appendAll(tx, programId, items.map(({ dayIndex, block }) => ({ dayIndex, columns: columns(block) })));
  });
  return items.length;
}

/** Week indexes that hold at least one block. */
export async function weeksWithBlocks(db: Db, programId: string): Promise<number[]> {
  const days = await db.block.findMany({ where: { programId }, distinct: ["dayIndex"], select: { dayIndex: true } });
  return [...new Set(days.map((d) => Math.floor(d.dayIndex / 7)))].sort((a, b) => a - b);
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
