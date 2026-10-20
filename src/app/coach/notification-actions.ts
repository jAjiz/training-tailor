"use server";

import { requireCoach } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { markAllInZone, openInZone, setPreferenceInZone } from "@/lib/notification-zone";
import type { ActionResult } from "@/lib/training/errors";

// The coach zone has no push: there is deliberately no subscription action here.

export async function openNotificationAction(id: unknown): Promise<ActionResult<{ href: string }>> {
  return runAction("openCoachNotificationAction", async (session) => {
    const coach = await requireCoach();
    return openInZone("coach", coach.userId, Boolean(session?.impersonatedBy), id);
  });
}

export async function markAllReadAction(): Promise<ActionResult> {
  return runAction("markAllCoachReadAction", async (session) => {
    const coach = await requireCoach();
    await markAllInZone("coach", coach.userId, Boolean(session?.impersonatedBy));
  });
}

export async function setPreferenceAction(kind: unknown, enabled: unknown): Promise<ActionResult> {
  return runAction("setCoachPreferenceAction", async () => {
    const coach = await requireCoach();
    await setPreferenceInZone("coach", coach.userId, kind, enabled);
  });
}
