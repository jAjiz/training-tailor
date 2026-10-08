"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/training/errors";
import { BlockInput, parse } from "@/lib/training/schemas";
import {
  createBlock, deleteBlock, duplicateBlock, duplicateDay, duplicateWeek, moveBlock, updateBlock,
} from "@/lib/training/services/blocks";

const Id = z.string().min(1).max(64);
const Day = z.number().int().min(0).max(100_000);
const PLANNER = "/coach/programs/[id]";

async function coachAction(fn: (coachId: string) => Promise<unknown>): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    await fn(coach.id);
    revalidatePath(PLANNER, "page");
  });
}

export async function createBlockAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { programId, dayIndex, block } = parse(z.object({ programId: Id, dayIndex: Day, block: BlockInput }), raw);
    await createBlock(prisma, coachId, programId, dayIndex, block);
  });
}

export async function updateBlockAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { blockId, block } = parse(z.object({ blockId: Id, block: BlockInput }), raw);
    await updateBlock(prisma, coachId, blockId, block);
  });
}

export async function deleteBlockAction(blockId: unknown) {
  return coachAction((coachId) => deleteBlock(prisma, coachId, parse(Id, blockId)));
}

export async function moveBlockAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { blockId, toDayIndex, toPosition } = parse(
      z.object({ blockId: Id, toDayIndex: Day, toPosition: z.number().int().min(0).max(1000) }), raw);
    await moveBlock(prisma, coachId, blockId, toDayIndex, toPosition);
  });
}

export async function duplicateBlockAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { blockId, targetDayIndex } = parse(z.object({ blockId: Id, targetDayIndex: Day }), raw);
    await duplicateBlock(prisma, coachId, blockId, targetDayIndex);
  });
}

export async function duplicateDayAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { programId, fromDay, toDay } = parse(z.object({ programId: Id, fromDay: Day, toDay: Day }), raw);
    await duplicateDay(prisma, coachId, programId, fromDay, toDay);
  });
}

export async function duplicateWeekAction(raw: unknown) {
  return coachAction(async (coachId) => {
    const { programId, fromWeek, toWeek } = parse(z.object({ programId: Id, fromWeek: Day, toWeek: Day }), raw);
    await duplicateWeek(prisma, coachId, programId, fromWeek, toWeek);
  });
}
