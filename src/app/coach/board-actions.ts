"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { dispatch } from "@/lib/notifications/dispatch";
import type { ActionResult } from "@/lib/training/errors";
import { parse, parseAnnouncementBody } from "@/lib/training/schemas";
import { createAnnouncement, deleteAnnouncement, updateAnnouncement } from "@/lib/training/services/announcements";

const Id = z.string().min(1).max(64);

/** Both the coach's and the athletes' board show the same announcements. */
function revalidateBoards() {
  revalidatePath("/coach/programs/[id]/board", "page");
  revalidatePath("/programs/[id]/board", "page");
}

export async function createAnnouncementAction(programId: unknown, body: unknown): Promise<ActionResult> {
  return runAction("createAnnouncementAction", async () => {
    const coach = await requireCoach();
    const { intents } = await createAnnouncement(prisma, coach, parse(Id, programId), parseAnnouncementBody(body));
    dispatch(intents);
    revalidateBoards();
  });
}

export async function updateAnnouncementAction(id: unknown, body: unknown): Promise<ActionResult> {
  return runAction("updateAnnouncementAction", async () => {
    const coach = await requireCoach();
    await updateAnnouncement(prisma, coach.id, parse(Id, id), parseAnnouncementBody(body));
    revalidateBoards();
  });
}

export async function deleteAnnouncementAction(id: unknown): Promise<ActionResult> {
  return runAction("deleteAnnouncementAction", async () => {
    const coach = await requireCoach();
    await deleteAnnouncement(prisma, coach.id, parse(Id, id));
    revalidateBoards();
  });
}
