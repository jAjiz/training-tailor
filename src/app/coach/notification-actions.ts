"use server";

import { revalidatePath } from "next/cache";
import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { markAllInZone, openInZone, setPreferenceInZone } from "@/lib/notification-zone";
import type { ActionResult } from "@/lib/training/errors";

// The coach zone has no push: there is deliberately no subscription action here.

export async function openNotificationAction(id: unknown): Promise<ActionResult<{ href: string }>> {
  return runAction("openCoachNotificationAction", async (session) => {
    const coach = await requireCoach();
    const impersonating = Boolean(session?.impersonatedBy);
    const result = await openInZone("coach", coach.userId, impersonating, id);
    // The bell lives in the zone layout: without this its dot stays stale after the row is marked read.
    if (!impersonating) revalidatePath("/coach", "layout");
    return result;
  });
}

export async function markAllReadAction(): Promise<ActionResult> {
  return runAction("markAllCoachReadAction", async (session) => {
    const coach = await requireCoach();
    await markAllInZone("coach", coach.userId, Boolean(session?.impersonatedBy));
    if (!session?.impersonatedBy) revalidatePath("/coach", "layout");
  });
}

export async function setPreferenceAction(kind: unknown, enabled: unknown): Promise<ActionResult> {
  return runAction("setCoachPreferenceAction", async () => {
    const coach = await requireCoach();
    await setPreferenceInZone("coach", coach.userId, kind, enabled);
  });
}
