"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/training/errors";
import { ProgramCreateInput, ProgramUpdateInput, parse } from "@/lib/training/schemas";
import {
  archiveProgram, createProgram, regenerateInvite, setProgramPublished, setWeekPublished, updateProgram,
} from "@/lib/training/services/programs";

const Id = z.string().min(1).max(64);

export async function createProgramAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const coach = await requireCoach();
    const program = await createProgram(prisma, coach.id, parse(ProgramCreateInput, raw));
    revalidatePath("/coach");
    return { id: program.id };
  });
}

export async function updateProgramAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    const { programId, program } = parse(z.object({ programId: Id, program: ProgramUpdateInput }), raw);
    await updateProgram(prisma, coach.id, programId, program);
    revalidatePath(`/coach/programs/${programId}`, "layout");
  });
}

export async function archiveProgramAction(programId: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    await archiveProgram(prisma, coach.id, parse(Id, programId));
    revalidatePath("/coach", "layout");
  });
}

export async function regenerateInviteAction(programId: unknown): Promise<ActionResult<{ code: string }>> {
  return runAction(async () => {
    const coach = await requireCoach();
    const id = parse(Id, programId);
    const code = await regenerateInvite(prisma, coach.id, id);
    revalidatePath(`/coach/programs/${id}/athletes`);
    return { code };
  });
}

export async function setWeekPublishedAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    const { programId, weekIndex, published } = parse(
      z.object({ programId: Id, weekIndex: z.number().int().min(0), published: z.boolean() }), raw);
    await setWeekPublished(prisma, coach.id, programId, weekIndex, published);
    revalidatePath(`/coach/programs/${programId}`);
  });
}

export async function setProgramPublishedAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const coach = await requireCoach();
    const { programId, published } = parse(z.object({ programId: Id, published: z.boolean() }), raw);
    await setProgramPublished(prisma, coach.id, programId, published);
    revalidatePath(`/coach/programs/${programId}`);
  });
}
