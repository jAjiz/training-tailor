import { comingMonday, reminderWeekIndex } from "@/lib/notifications/reminder";
import { deliver, intent, type NotificationIntent } from "@/lib/notifications/notify";
import type { PushSender } from "@/lib/notifications/push";
import { fromDbDate } from "../dates";
import { coachRecipient, deleteOldNotifications } from "./notifications";
import type { Db } from "./types";

const RETENTION_DAYS = 90;

/** One reminder per continuous program whose coming week is not published yet. */
export async function weekReminderIntents(db: Db, now: Date): Promise<NotificationIntent[]> {
  const monday = comingMonday(now);
  const programs = await db.program.findMany({
    where: {
      kind: "continuous", archivedAt: null, startDate: { not: null },
      coach: { is: { status: "approved" } },
      enrollments: { some: { removedAt: null, leftAt: null, athlete: { disabledAt: null } } },
    },
    include: { coach: true, weeksPublished: { select: { weekIndex: true } } },
  });
  const intents: NotificationIntent[] = [];
  for (const p of programs) {
    const weekIndex = reminderWeekIndex(fromDbDate(p.startDate!), monday);
    if (weekIndex < 0 || p.weeksPublished.some((w) => w.weekIndex === weekIndex)) continue;
    intents.push(intent(
      "week_reminder", coachRecipient(p),
      { programId: p.id, programName: p.name, monday, weekIndex },
      { programId: p.id, groupKey: `week_reminder:${p.id}:${weekIndex}` },
    ));
  }
  return intents;
}

export async function runWeeklyJob(db: Db, now: Date, sender: PushSender | null): Promise<{ reminders: number; deleted: number }> {
  const { created } = await deliver(db, await weekReminderIntents(db, now), sender);
  const deleted = await deleteOldNotifications(db, new Date(now.getTime() - RETENTION_DAYS * 86_400_000));
  return { reminders: created, deleted };
}
