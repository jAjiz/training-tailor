"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAthlete } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/training/errors";
import { ResultInput, parse } from "@/lib/training/schemas";
import { deleteResult, saveResult, toggleFistBump, type SinglePrompt } from "@/lib/training/services/results";

const Id = z.string().min(1).max(64);

export async function saveResultAction(raw: unknown): Promise<ActionResult<{ singlePrompt: SinglePrompt | null }>> {
  return runAction(async () => {
    const athlete = await requireAthlete();
    const { singlePrompt } = await saveResult(prisma, athlete, parse(ResultInput, raw));
    revalidatePath("/", "layout");
    return { singlePrompt };
  });
}

export async function deleteResultAction(blockId: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const athlete = await requireAthlete();
    await deleteResult(prisma, athlete.id, parse(Id, blockId));
    revalidatePath("/", "layout");
  });
}

export async function toggleFistBumpAction(resultId: unknown): Promise<ActionResult<{ bumped: boolean; count: number }>> {
  return runAction(async () => {
    const athlete = await requireAthlete();
    return toggleFistBump(prisma, athlete, parse(Id, resultId));
  });
}
