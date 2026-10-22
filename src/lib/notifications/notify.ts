import { createTranslator } from "next-intl";
import en from "@/i18n/messages/en.json";
import es from "@/i18n/messages/es.json";
import type { Db } from "@/lib/training/services/types";
import {
  AUDIENCE, ON_EXISTING, notificationHref, notificationText, type NotificationData, type NotificationKind,
} from "./kinds";
import type { PushOutcome, PushSender } from "./push";

export type Recipient = { userId: string; locale: string | null };
export type NotificationIntent<K extends NotificationKind = NotificationKind> = {
  kind: K; recipients: Recipient[]; data: NotificationData[K];
  programId: string | null; entityId: string | null; groupKey: string | null;
};

export function intent<K extends NotificationKind>(
  kind: K, recipients: Recipient[], data: NotificationData[K],
  refs: { programId?: string | null; entityId?: string | null; groupKey?: string | null } = {},
): NotificationIntent<K> {
  return { kind, recipients, data, programId: refs.programId ?? null, entityId: refs.entityId ?? null, groupKey: refs.groupKey ?? null };
}

type Translate = (key: string, values?: Record<string, string | number>) => string;
const MESSAGES = { es, en } as const;
/** Root translator for the recipient locale; anything but "en" falls back to Spanish. */
const translatorFor = (locale: string | null): Translate => {
  const l = locale === "en" ? "en" : "es";
  return createTranslator({ locale: l, messages: MESSAGES[l] }) as unknown as Translate;
};

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

type Row = { id: string };
type Written = { row: Row; how: "created" | "refreshed" } | null;

/** Writes the inbox row for one recipient; null when an existing grouped row is left alone. */
async function write(db: Db, it: NotificationIntent, userId: string): Promise<Written> {
  const data = it.data as object;
  const create = () => db.notification.create({
    data: { userId, audience: AUDIENCE[it.kind], kind: it.kind, programId: it.programId, entityId: it.entityId, groupKey: it.groupKey, data },
  });
  if (it.groupKey === null) return { row: await create(), how: "created" };

  const onHit = async (existing: Row): Promise<Written> => {
    if (ON_EXISTING[it.kind] !== "refresh") return null;
    // Explicit updatedAt: @updatedAt only moves when an update is issued with changed fields, and the bell sorts by it.
    const row = await db.notification.update({ where: { id: existing.id }, data: { data, readAt: null, updatedAt: new Date() } });
    return { row, how: "refreshed" };
  };

  const key = { userId_groupKey: { userId, groupKey: it.groupKey } };
  const existing = await db.notification.findUnique({ where: key });
  if (existing) return onHit(existing);
  try {
    return { row: await create(), how: "created" };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    // A concurrent delivery inserted the row first: treat it as a hit.
    const raced = await db.notification.findUnique({ where: key });
    if (!raced) throw e;
    return onHit(raced);
  }
}

/** Pushes in flight at once: a slow or hung device only holds its own slot, and push services are not flooded. */
const PUSH_CONCURRENCY = 8;

/** Runs `task` over `items` with at most `limit` running at once. `task` must not throw. */
async function runLimited<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

type PushJob = { it: NotificationIntent; recipient: Recipient; row: Row };
type Sub = { id: string; userId: string; endpoint: string; p256dh: string; auth: string };

/** Sends every job to each of its user's devices, PUSH_CONCURRENCY at a time. Returns the number of "ok" sends. */
async function pushAll(db: Db, sender: PushSender, jobs: PushJob[]): Promise<number> {
  if (jobs.length === 0) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId: { in: [...new Set(jobs.map((j) => j.recipient.userId))] } } });
  const byUser = new Map<string, Sub[]>();
  for (const sub of subs) byUser.set(sub.userId, [...(byUser.get(sub.userId) ?? []), sub]);

  const sends = jobs.flatMap((job) => {
    const devices = byUser.get(job.recipient.userId) ?? [];
    if (devices.length === 0) return [];
    const { title, body } = notificationText(job.it.kind, job.it.data, translatorFor(job.recipient.locale));
    const payload = { title, body, url: notificationHref(job.it.kind, job.it.data), tag: job.it.groupKey ?? job.row.id };
    return devices.map((sub) => ({ sub, payload }));
  });

  let pushed = 0;
  await runLimited(sends, PUSH_CONCURRENCY, async ({ sub, payload }) => {
    try {
      let outcome: PushOutcome;
      try {
        outcome = await sender.send({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
      } catch (e) {
        console.error("push send threw", e);
        outcome = "failed";
      }
      if (outcome === "ok") {
        pushed++;
        await db.pushSubscription.updateMany({ where: { id: sub.id }, data: { lastOkAt: new Date() } });
      } else if (outcome === "gone") {
        await db.pushSubscription.deleteMany({ where: { id: sub.id } });
      }
    } catch (e) {
      console.error("push delivery failed", e);
    }
  });
  return pushed;
}

/** Writes all inbox rows first, then pushes them in parallel (athlete audience only). Never throws for a push or a single recipient's write failure. */
export async function deliver(db: Db, intents: NotificationIntent[], sender: PushSender | null) {
  const result = { created: 0, refreshed: 0, pushed: 0 };
  const jobs: PushJob[] = [];
  for (const it of intents) {
    const unique = [...new Map(it.recipients.map((r) => [r.userId, r])).values()];
    if (unique.length === 0) continue;
    const off = await db.notificationPreference.findMany({
      where: { kind: it.kind, enabled: false, userId: { in: unique.map((r) => r.userId) } },
      select: { userId: true },
    });
    const muted = new Set(off.map((p) => p.userId));
    for (const recipient of unique) {
      if (muted.has(recipient.userId)) continue;
      try {
        const written = await write(db, it, recipient.userId);
        if (!written) continue;
        result[written.how]++;
        if (sender && AUDIENCE[it.kind] === "athlete") jobs.push({ it, recipient, row: written.row });
      } catch (e) {
        // One recipient's failed write must not cost the others their notification.
        console.error("notification write failed", e);
      }
    }
  }
  if (sender) {
    try {
      result.pushed = await pushAll(db, sender, jobs);
    } catch (e) {
      console.error("push delivery failed", e);
    }
  }
  return result;
}
