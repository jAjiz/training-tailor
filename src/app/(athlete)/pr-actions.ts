"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAthlete } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/training/errors";
import { PrInput, parse } from "@/lib/training/schemas";
import { addPr, deletePr } from "@/lib/training/services/prs";

export async function addPrAction(raw: unknown): Promise<ActionResult> {
  return runAction("addPrAction", async () => {
    const athlete = await requireAthlete();
    await addPr(prisma, athlete, parse(PrInput, raw));
    revalidatePath("/", "layout");
  });
}

export async function deletePrAction(prId: unknown): Promise<ActionResult> {
  return runAction("deletePrAction", async () => {
    const athlete = await requireAthlete();
    await deletePr(prisma, athlete.id, parse(z.string().min(1).max(64), prId));
    revalidatePath("/", "layout");
  });
}
