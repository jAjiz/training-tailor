"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/training/errors";
import { parse } from "@/lib/training/schemas";
import { setEnrollmentRemoved } from "@/lib/training/services/enrollments";

async function setRemoved(enrollmentId: unknown, removed: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    await setEnrollmentRemoved(prisma, coach.id, parse(z.string().min(1).max(64), enrollmentId), removed);
    revalidatePath("/coach/programs/[id]/athletes", "page");
  });
}

export async function removeAthleteAction(enrollmentId: unknown) {
  return setRemoved(enrollmentId, true);
}

export async function restoreAthleteAction(enrollmentId: unknown) {
  return setRemoved(enrollmentId, false);
}
