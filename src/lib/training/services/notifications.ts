import type { Notification } from "@/generated/prisma/client";
import { AUDIENCE, NOTIFICATION_KINDS, type Audience, type NotificationKind } from "@/lib/notifications/kinds";
import type { Recipient } from "@/lib/notifications/notify";
import type { PushTarget } from "@/lib/notifications/push";
import { TrainingError } from "../errors";
import type { Db, DbOrTx } from "./types";

const kindsOf = (audience: Audience) => NOTIFICATION_KINDS.filter((k) => AUDIENCE[k] === audience);

/** Athletes with an active enrollment in the program whose account is not disabled. */
export async function activeAthleteRecipients(db: DbOrTx, programId: string, excludeUserId: string | null = null): Promise<Recipient[]> {
  const rows = await db.enrollment.findMany({
    where: { programId, removedAt: null, leftAt: null, athlete: { disabledAt: null } },
    select: { athlete: { select: { userId: true, locale: true } } },
  });
  return rows.map((r) => ({ userId: r.athlete.userId, locale: r.athlete.locale })).filter((r) => r.userId !== excludeUserId);
}

export function coachRecipient(
  program: { coach: { userId: string; status: string; locale: string | null } | null },
  excludeUserId?: string,
): Recipient[] {
  const c = program.coach;
  if (!c || c.status !== "approved" || c.userId === excludeUserId) return [];
  return [{ userId: c.userId, locale: c.locale }];
}

export function listInbox(db: Db, userId: string, audience: Audience, take = 50): Promise<Notification[]> {
  return db.notification.findMany({
    where: { userId, audience, kind: { in: kindsOf(audience) } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
  });
}

export function unreadCount(db: Db, userId: string, audience: Audience): Promise<number> {
  return db.notification.count({ where: { userId, audience, kind: { in: kindsOf(audience) }, readAt: null } });
}

/** One of the user's own rows in this audience; anything else is `not_found`. */
export async function getOwnNotification(db: Db, userId: string, audience: Audience, id: string): Promise<Notification> {
  const row = await db.notification.findFirst({ where: { id, userId, audience, kind: { in: kindsOf(audience) } } });
  if (!row) throw new TrainingError("not_found");
  return row;
}

export async function markRead(db: Db, userId: string, id: string): Promise<Notification> {
  const own = await db.notification.findFirst({ where: { id, userId } });
  if (!own) throw new TrainingError("not_found");
  if (own.readAt) return own;
  return db.notification.update({ where: { id }, data: { readAt: new Date() } });
}

export async function markAllRead(db: Db, userId: string, audience: Audience): Promise<void> {
  await db.notification.updateMany({ where: { userId, audience, readAt: null }, data: { readAt: new Date() } });
}

export async function markProgramAnnouncementsRead(db: Db, userId: string, programId: string): Promise<void> {
  await db.notification.updateMany({
    where: { userId, kind: "announcement", programId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getPreferences(db: Db, userId: string, audience: Audience): Promise<Record<NotificationKind, boolean>> {
  const kinds = kindsOf(audience);
  const rows = await db.notificationPreference.findMany({ where: { userId, kind: { in: kinds } } });
  const off = new Set(rows.filter((r) => !r.enabled).map((r) => r.kind));
  return Object.fromEntries(kinds.map((k) => [k, !off.has(k)])) as Record<NotificationKind, boolean>;
}

export async function setPreference(db: Db, userId: string, kind: NotificationKind, enabled: boolean): Promise<void> {
  await db.notificationPreference.upsert({
    where: { userId_kind: { userId, kind } },
    create: { userId, kind, enabled },
    update: { enabled },
  });
}

/** Upsert by endpoint: a device shared by two accounts belongs to whoever subscribed last. */
export async function saveSubscription(db: Db, userId: string, s: PushTarget & { userAgent: string | null }): Promise<void> {
  const fields = { userId, p256dh: s.p256dh, auth: s.auth, userAgent: s.userAgent };
  await db.pushSubscription.upsert({ where: { endpoint: s.endpoint }, create: { endpoint: s.endpoint, ...fields }, update: fields });
}

export async function deleteSubscription(db: Db, userId: string, endpoint: string): Promise<void> {
  await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function deleteOldNotifications(db: Db, before: Date): Promise<number> {
  return (await db.notification.deleteMany({ where: { updatedAt: { lt: before } } })).count;
}

/** The audience's inbox rows and preferences, for removing one role while keeping the other. */
export async function deleteAudienceData(tx: DbOrTx, userId: string, audience: Audience): Promise<void> {
  await tx.notification.deleteMany({ where: { userId, audience } });
  await tx.notificationPreference.deleteMany({ where: { userId, kind: { in: kindsOf(audience) } } });
}
