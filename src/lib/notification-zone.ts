import { z } from "zod";
import { prisma } from "@/lib/db";
import { AUDIENCE, NOTIFICATION_KINDS, notificationHref, type Audience, type NotificationData, type NotificationKind } from "@/lib/notifications/kinds";
import { TrainingError } from "@/lib/training/errors";
import { parse } from "@/lib/training/schemas";
import { getOwnNotification, markAllRead, markRead, setPreference } from "@/lib/training/services/notifications";

const Id = z.string().min(1).max(64);
const Kind = z.enum(NOTIFICATION_KINDS);

/** Shared by the athlete and coach action files: each passes its own audience, so a zone never touches the other's rows. */
export async function openInZone(audience: Audience, userId: string, impersonating: boolean, rawId: unknown): Promise<{ href: string }> {
  const id = parse(Id, rawId);
  // Ownership is checked even when nothing is marked: an impersonating admin must not read other users' rows either.
  const row = await getOwnNotification(prisma, userId, audience, id);
  if (!impersonating) await markRead(prisma, userId, id);
  const kind = row.kind as NotificationKind;
  return { href: notificationHref(kind, row.data as NotificationData[typeof kind]) };
}

/** While impersonating, nothing is marked read: the user still sees it unread. */
export async function markAllInZone(audience: Audience, userId: string, impersonating: boolean): Promise<void> {
  if (!impersonating) await markAllRead(prisma, userId, audience);
}

export async function setPreferenceInZone(audience: Audience, userId: string, rawKind: unknown, rawEnabled: unknown): Promise<void> {
  const kind = parse(Kind, rawKind);
  if (AUDIENCE[kind] !== audience) throw new TrainingError("invalid_request");
  await setPreference(prisma, userId, kind, parse(z.boolean(), rawEnabled));
}
