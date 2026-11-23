"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { dispatch } from "@/lib/notifications/dispatch";
import { getStripeGateway, stripeGatewayIfEnabled } from "@/lib/stripe/client";
import { TrainingError, type ActionResult } from "@/lib/training/errors";
import { ProgramCreateInput, ProgramUpdateInput, parse, parseMajorAmount } from "@/lib/training/schemas";
import { retryCancellations, setProgramPrice, syncSubscriptionPrices } from "@/lib/training/services/payments";
import {
  archiveProgram, createProgram, getOwnedProgram, regenerateInvite, setProgramPublished, setWeekPublished, updateProgram,
} from "@/lib/training/services/programs";
import { setProgramTailoring } from "@/lib/training/services/tailoring";

const Id = z.string().min(1).max(64);

export async function createProgramAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction("createProgramAction", async () => {
    const coach = await requireCoach();
    const program = await createProgram(prisma, coach.id, parse(ProgramCreateInput, raw));
    revalidatePath("/coach");
    return { id: program.id };
  });
}

export async function updateProgramAction(raw: unknown): Promise<ActionResult> {
  return runAction("updateProgramAction", async () => {
    const coach = await requireCoach();
    const { programId, program } = parse(z.object({ programId: Id, program: ProgramUpdateInput }), raw);
    await updateProgram(prisma, coach.id, programId, program);
    revalidatePath(`/coach/programs/${programId}`, "layout");
  });
}

/** `failed`: how many subscriptions Stripe could not cancel (the program is archived anyway). */
export async function archiveProgramAction(programId: unknown): Promise<ActionResult<{ failed: number }>> {
  return runAction("archiveProgramAction", async () => {
    const coach = await requireCoach();
    const { failed } = await archiveProgram(prisma, stripeGatewayIfEnabled(), coach.id, parse(Id, programId));
    revalidatePath("/coach", "layout");
    return { failed: failed.length };
  });
}

/** Cancels again the subscriptions the app ended in this program and Stripe has not cancelled yet. */
export async function retryCancellationsAction(programId: unknown): Promise<ActionResult<{ failed: number }>> {
  return runAction("retryCancellationsAction", async () => {
    const coach = await requireCoach();
    const program = await getOwnedProgram(prisma, coach.id, parse(Id, programId));
    const failed = await retryCancellations(prisma, stripeGatewayIfEnabled(), program.id);
    revalidatePath(`/coach/programs/${program.id}`, "layout");
    return { failed: failed.length };
  });
}

/** Moves the subscriptions still on an old price to the program's current one. */
export async function syncSubscriptionPricesAction(programId: unknown): Promise<ActionResult<{ failed: number }>> {
  return runAction("syncSubscriptionPricesAction", async () => {
    const coach = await requireCoach();
    const program = await getOwnedProgram(prisma, coach.id, parse(Id, programId));
    const { failed } = await syncSubscriptionPrices(prisma, getStripeGateway(), program.id);
    revalidatePath(`/coach/programs/${program.id}`, "layout");
    return { failed: failed.length };
  });
}

export async function regenerateInviteAction(programId: unknown): Promise<ActionResult<{ code: string }>> {
  return runAction("regenerateInviteAction", async () => {
    const coach = await requireCoach();
    const id = parse(Id, programId);
    const code = await regenerateInvite(prisma, coach.id, id);
    revalidatePath(`/coach/programs/${id}/athletes`);
    return { code };
  });
}

export async function setWeekPublishedAction(raw: unknown): Promise<ActionResult> {
  return runAction("setWeekPublishedAction", async () => {
    const coach = await requireCoach();
    const { programId, weekIndex, published } = parse(
      z.object({ programId: Id, weekIndex: z.number().int().min(0), published: z.boolean() }), raw);
    dispatch(await setWeekPublished(prisma, coach.id, programId, weekIndex, published));
    revalidatePath(`/coach/programs/${programId}`);
  });
}

export async function setProgramPublishedAction(raw: unknown): Promise<ActionResult> {
  return runAction("setProgramPublishedAction", async () => {
    const coach = await requireCoach();
    const { programId, published } = parse(z.object({ programId: Id, published: z.boolean() }), raw);
    await setProgramPublished(prisma, coach.id, programId, published);
    revalidatePath(`/coach/programs/${programId}`);
  });
}

export async function setProgramTailoringAction(raw: unknown): Promise<ActionResult> {
  return runAction("setProgramTailoringAction", async () => {
    const coach = await requireCoach();
    const { programId, enabled } = parse(z.object({ programId: Id, enabled: z.boolean() }), raw);
    await setProgramTailoring(prisma, coach.id, programId, enabled);
    revalidatePath(`/coach/programs/${programId}`, "layout");
  });
}

/** `amount` is what the coach typed, in major units ("15" or "15,50"); null when making the program free. */
export async function setProgramPriceAction(raw: unknown): Promise<ActionResult<{ failed: string[] }>> {
  return runAction("setProgramPriceAction", async () => {
    const coach = await requireCoach();
    const { programId, paid, amount } = parse(
      z.object({ programId: Id, paid: z.boolean(), amount: z.string().max(20).nullable() }), raw);
    const minor = paid ? parseMajorAmount(amount ?? "") : null;
    if (paid && minor === null) throw new TrainingError("price_invalid");
    const { failed } = await setProgramPrice(prisma, getStripeGateway(), coach.id, programId, { paid, amount: minor });
    revalidatePath(`/coach/programs/${programId}`, "layout");
    return { failed };
  });
}
