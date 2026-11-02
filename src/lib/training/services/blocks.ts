import { Prisma, type Block } from "@/generated/prisma/client";
import { toJson } from "@/lib/json";
import { TrainingError } from "../errors";
import { NOTE_MAX, type BlockInputValue } from "../schemas";
import { assertLiftMovement } from "./catalog";
import { assertWritable, getOwnedProgram } from "./programs";
import type { Db, DbOrTx } from "./types";

type ProgramRange = { kind: string; weeks: number | null };

export function assertDay(program: ProgramRange, dayIndex: number) {
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

export async function writableProgram(db: Db, coachId: string, programId: string) {
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

const appendCopies = (db: DbOrTx, programId: string, blocks: Block[], toDay: (b: Block) => number) =>
  appendAll(db, programId, blocks.map((b) => ({ dayIndex: toDay(b), columns: copyOf(b) })));

export type ImportItem = { dayIndex: number; block: BlockInputValue };
/** An imported day goal (`index` = dayIndex) or week note (`index` = weekIndex). */
export type ImportNote = { scope: "day" | "week"; index: number; text: string };
export type ImportMode = "append" | "replace";

/**
 * Writes the selected translated blocks and notes in one transaction; returns how many. "append" puts blocks
 * after what is already in their days and appends notes to existing ones after a blank line. "replace" first
 * deletes every block (results go with them, as with deleteBlock), the week note and the day notes of each week
 * that receives a block and already holds one; every other week is handled as in "append". Several imported notes for one
 * day or week are joined in order; a joined note over NOTE_MAX refuses the whole import.
 */
export async function importBlocks(
  db: Db, coachId: string, programId: string, { items, notes }: { items: ImportItem[]; notes: ImportNote[] },
  mode: ImportMode = "append",
) {
  const program = await writableProgram(db, coachId, programId);
  for (const { dayIndex } of items) assertDay(program, dayIndex);
  for (const { scope, index } of notes) assertDay(program, scope === "day" ? index : index * 7);
  const lifts = new Set(items.flatMap(({ block }) => (block.kind === "barbell" ? [block.movement] : [])));
  for (const movement of lifts) await assertLiftMovement(db, movement);
  // Imported texts per target, in document order; the key doubles as the error's issue.
  const texts = new Map<string, { scope: ImportNote["scope"]; index: number; texts: string[] }>();
  for (const { scope, index, text } of notes) {
    const key = `${scope}:${index}`;
    const group = texts.get(key) ?? { scope, index, texts: [] };
    group.texts.push(text);
    texts.set(key, group);
  }
  await db.$transaction(async (tx) => {
    const receiving = [...new Set(items.map(({ dayIndex }) => Math.floor(dayIndex / 7)))];
    // Only weeks that already hold a block are replaced: the same weeks the coach was asked about.
    const filled = mode === "replace" && receiving.length > 0
      ? await tx.block.findMany({
        where: { programId, OR: receiving.map((w) => ({ dayIndex: { gte: w * 7, lt: w * 7 + 7 } })) },
        distinct: ["dayIndex"], select: { dayIndex: true },
      })
      : [];
    const weeks = [...new Set(filled.map((b) => Math.floor(b.dayIndex / 7)))];
    if (weeks.length > 0) await clearWeeks(tx, programId, weeks);
    await appendAll(tx, programId, items.map(({ dayIndex, block }) => ({ dayIndex, columns: columns(block) })));
    for (const [key, { scope, index, texts: imported }] of texts) {
      const existing = scope === "day"
        ? await tx.dayNote.findUnique({ where: { programId_dayIndex: { programId, dayIndex: index } } })
        : await tx.weekNote.findUnique({ where: { programId_weekIndex: { programId, weekIndex: index } } });
      const body = [...(existing ? [existing.body] : []), ...imported].join("\n\n");
      if (body.length > NOTE_MAX) throw new TrainingError("note_too_long", [key]);
      if (scope === "day") await putDayNote(tx, programId, index, body);
      else await putWeekNote(tx, programId, index, body);
    }
  });
  return items.length + notes.length;
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
  const note = await db.dayNote.findUnique({ where: { programId_dayIndex: { programId, dayIndex: fromDay } } });
  await db.$transaction(async (tx) => {
    await appendCopies(tx, programId, blocks, () => toDay);
    if (note) await putDayNote(tx, programId, toDay, note.body);
  });
}

export async function duplicateWeek(db: Db, coachId: string, programId: string, fromWeek: number, toWeek: number) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, fromWeek * 7);
  assertDay(program, toWeek * 7 + 6);
  const range = { gte: fromWeek * 7, lt: fromWeek * 7 + 7 };
  const blocks = await db.block.findMany({
    where: { programId, dayIndex: range },
    orderBy: [{ dayIndex: "asc" }, { position: "asc" }],
  });
  const [weekNote, dayNotes] = await Promise.all([
    db.weekNote.findUnique({ where: { programId_weekIndex: { programId, weekIndex: fromWeek } } }),
    db.dayNote.findMany({ where: { programId, dayIndex: range } }),
  ]);
  await db.$transaction(async (tx) => {
    await appendCopies(tx, programId, blocks, (b) => toWeek * 7 + (b.dayIndex - fromWeek * 7));
    if (weekNote) await putWeekNote(tx, programId, toWeek, weekNote.body);
    for (const n of dayNotes) await putDayNote(tx, programId, toWeek * 7 + (n.dayIndex - fromWeek * 7), n.body);
  });
}

/** Deletes the day's blocks (results go with them, as with deleteBlock) and its day note. */
export async function clearDay(db: Db, coachId: string, programId: string, dayIndex: number) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, dayIndex);
  await db.$transaction((tx) => clearDays(tx, programId, [{ gte: dayIndex, lt: dayIndex + 1 }]));
}

/** Deletes the week's blocks (results go with them), its day notes and its week note. */
export async function clearWeek(db: Db, coachId: string, programId: string, weekIndex: number) {
  const program = await writableProgram(db, coachId, programId);
  assertDay(program, weekIndex * 7);
  await db.$transaction((tx) => clearWeeks(tx, programId, [weekIndex]));
}

async function clearWeeks(tx: DbOrTx, programId: string, weeks: number[]) {
  await clearDays(tx, programId, weeks.map((w) => ({ gte: w * 7, lt: w * 7 + 7 })));
  await tx.weekNote.deleteMany({ where: { programId, weekIndex: { in: weeks } } });
}

async function clearDays(tx: DbOrTx, programId: string, ranges: { gte: number; lt: number }[]) {
  const where = { programId, OR: ranges.map((dayIndex) => ({ dayIndex })) };
  // Results cascade away with the blocks; so must their grouped fist-bump entries (entityId is the resultId).
  const results = await tx.result.findMany({ where: { block: where }, select: { id: true } });
  await tx.notification.deleteMany({ where: { kind: "fist_bump", entityId: { in: results.map((r) => r.id) } } });
  await tx.block.deleteMany({ where });
  await tx.dayNote.deleteMany({ where });
}

const putDayNote = (tx: DbOrTx, programId: string, dayIndex: number, body: string) =>
  tx.dayNote.upsert({ where: { programId_dayIndex: { programId, dayIndex } }, create: { programId, dayIndex, body }, update: { body } });

const putWeekNote = (tx: DbOrTx, programId: string, weekIndex: number, body: string) =>
  tx.weekNote.upsert({ where: { programId_weekIndex: { programId, weekIndex } }, create: { programId, weekIndex, body }, update: { body } });
