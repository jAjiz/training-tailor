"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { NoteBody, parse } from "@/lib/training/schemas";
import { setDayNote, setWeekNote } from "@/lib/training/services/notes";

const Id = z.string().min(1).max(64);
const Index = z.number().int().min(0).max(100_000);
const PLANNER = "/coach/programs/[id]";

export async function setDayNoteAction(raw: unknown) {
  return runAction("setDayNoteAction", async () => {
    const coach = await requireCoach();
    const { programId, dayIndex, body } = parse(z.object({ programId: Id, dayIndex: Index, body: NoteBody }), raw);
    await setDayNote(prisma, coach.id, programId, dayIndex, body);
    revalidatePath(PLANNER, "page");
  });
}

export async function setWeekNoteAction(raw: unknown) {
  return runAction("setWeekNoteAction", async () => {
    const coach = await requireCoach();
    const { programId, weekIndex, body } = parse(z.object({ programId: Id, weekIndex: Index, body: NoteBody }), raw);
    await setWeekNote(prisma, coach.id, programId, weekIndex, body);
    revalidatePath(PLANNER, "page");
  });
}
