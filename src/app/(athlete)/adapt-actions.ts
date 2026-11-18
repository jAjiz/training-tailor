"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAthlete } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/training/errors";
import { parse } from "@/lib/training/schemas";
import { acceptAdaptation, discardAdaptation } from "@/lib/training/services/adaptations";

const BlockId = z.string().min(1).max(64);

export async function acceptAdaptationAction(blockId: unknown): Promise<ActionResult> {
  return runAction("acceptAdaptationAction", async () => {
    const athlete = await requireAthlete();
    await acceptAdaptation(prisma, athlete, parse(BlockId, blockId));
    revalidatePath("/", "layout");
  });
}

export async function discardAdaptationAction(blockId: unknown): Promise<ActionResult> {
  return runAction("discardAdaptationAction", async () => {
    const athlete = await requireAthlete();
    await discardAdaptation(prisma, athlete.id, parse(BlockId, blockId));
    revalidatePath("/", "layout");
  });
}
