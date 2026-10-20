"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { requireAthlete } from "@/lib/accounts";
import { runAction } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { markAllInZone, openInZone, setPreferenceInZone } from "@/lib/notification-zone";
import { TrainingError, type ActionResult } from "@/lib/training/errors";
import { parse } from "@/lib/training/schemas";
import { deleteSubscription, saveSubscription } from "@/lib/training/services/notifications";

const Subscription = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
});

export async function openNotificationAction(id: unknown): Promise<ActionResult<{ href: string }>> {
  return runAction("openNotificationAction", async (session) => {
    const athlete = await requireAthlete();
    const impersonating = Boolean(session?.impersonatedBy);
    const result = await openInZone("athlete", athlete.userId, impersonating, id);
    // The bell lives in the zone layout: without this its dot stays stale after the row is marked read.
    if (!impersonating) revalidatePath("/", "layout");
    return result;
  });
}

export async function markAllReadAction(): Promise<ActionResult> {
  return runAction("markAllReadAction", async (session) => {
    const athlete = await requireAthlete();
    await markAllInZone("athlete", athlete.userId, Boolean(session?.impersonatedBy));
    if (!session?.impersonatedBy) revalidatePath("/", "layout");
  });
}

export async function setPreferenceAction(kind: unknown, enabled: unknown): Promise<ActionResult> {
  return runAction("setPreferenceAction", async () => {
    const athlete = await requireAthlete();
    await setPreferenceInZone("athlete", athlete.userId, kind, enabled);
  });
}

/** Athlete zone only. Refused during an impersonation: the admin's device must never receive the user's notifications. */
export async function savePushSubscriptionAction(raw: unknown): Promise<ActionResult> {
  return runAction("savePushSubscriptionAction", async (session) => {
    const athlete = await requireAthlete();
    if (session?.impersonatedBy) throw new TrainingError("push_unavailable");
    const sub = parse(Subscription, raw);
    let userAgent: string | null = null;
    try {
      userAgent = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
    } catch {
      userAgent = null;
    }
    await saveSubscription(prisma, athlete.userId, { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent });
  });
}

export async function deletePushSubscriptionAction(endpoint: unknown): Promise<ActionResult> {
  return runAction("deletePushSubscriptionAction", async () => {
    const athlete = await requireAthlete();
    await deleteSubscription(prisma, athlete.userId, parse(z.string().min(1).max(2048), endpoint));
  });
}
