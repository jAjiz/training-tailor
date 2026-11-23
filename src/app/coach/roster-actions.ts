"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { stripeGatewayIfEnabled } from "@/lib/stripe/client";
import type { ActionResult } from "@/lib/training/errors";
import { parse } from "@/lib/training/schemas";
import { setEnrollmentRemoved } from "@/lib/training/services/enrollments";
import { setAccessGranted } from "@/lib/training/services/payments";

/** `failed`: how many subscriptions Stripe could not cancel on removal (the athlete is removed anyway). */
async function setRemoved(name: string, enrollmentId: unknown, removed: boolean): Promise<ActionResult<{ failed: number }>> {
  return runAction(name, async () => {
    const coach = await requireCoach();
    const { failed } = await setEnrollmentRemoved(
      prisma, stripeGatewayIfEnabled(), coach.id, parse(z.string().min(1).max(64), enrollmentId), removed);
    revalidatePath("/coach/programs/[id]/athletes", "page");
    return { failed: failed.length };
  });
}

export async function removeAthleteAction(enrollmentId: unknown) {
  return setRemoved("removeAthleteAction", enrollmentId, true);
}

export async function restoreAthleteAction(enrollmentId: unknown) {
  return setRemoved("restoreAthleteAction", enrollmentId, false);
}

/** `failed`: how many subscriptions Stripe could not cancel on granting (access is granted anyway). */
async function setGranted(name: string, enrollmentId: unknown, granted: boolean): Promise<ActionResult<{ failed: number }>> {
  return runAction(name, async () => {
    const coach = await requireCoach();
    const { failed } = await setAccessGranted(
      prisma, stripeGatewayIfEnabled(), coach.id, parse(z.string().min(1).max(64), enrollmentId), granted);
    revalidatePath("/coach/programs/[id]/athletes", "page");
    return { failed: failed.length };
  });
}

export async function grantAccessAction(enrollmentId: unknown) {
  return setGranted("grantAccessAction", enrollmentId, true);
}

export async function revokeAccessAction(enrollmentId: unknown) {
  return setGranted("revokeAccessAction", enrollmentId, false);
}
