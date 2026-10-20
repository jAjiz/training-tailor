import type { Announcement, Program } from "@/generated/prisma/client";
import { excerpt } from "@/lib/notifications/kinds";
import { intent, type NotificationIntent } from "@/lib/notifications/notify";
import { TrainingError } from "../errors";
import { parseAnnouncementBody } from "../schemas";
import { getEnrollmentStatus } from "./enrollments";
import { activeAthleteRecipients } from "./notifications";
import { assertWritable, getOwnedProgram } from "./programs";
import type { Db } from "./types";

/** The coach's own announcement, with its program; another coach's (or none) is `not_found`. */
async function getOwnedAnnouncement(db: Db, coachId: string, id: string) {
  const found = await db.announcement.findFirst({ where: { id, program: { coachId } }, include: { program: true } });
  if (!found) throw new TrainingError("not_found");
  return found;
}

/** Posts an announcement. The intent (one per post, none when nobody would receive it) excludes the coach's own athlete profile. */
export async function createAnnouncement(
  db: Db, coach: { id: string; userId: string }, programId: string, body: string,
): Promise<{ announcement: Announcement; intents: NotificationIntent[] }> {
  const text = parseAnnouncementBody(body);
  const program = await getOwnedProgram(db, coach.id, programId);
  assertWritable(program);
  const announcement = await db.announcement.create({ data: { programId, body: text } });
  const recipients = await activeAthleteRecipients(db, programId, coach.userId);
  const intents = recipients.length === 0 ? [] : [
    intent("announcement", recipients, { programId, programName: program.name, excerpt: excerpt(text) }, { programId, entityId: announcement.id }),
  ];
  return { announcement, intents };
}

export async function updateAnnouncement(db: Db, coachId: string, id: string, body: string): Promise<Announcement> {
  const text = parseAnnouncementBody(body);
  const { program } = await getOwnedAnnouncement(db, coachId, id);
  assertWritable(program);
  return db.announcement.update({ where: { id }, data: { body: text, editedAt: new Date() } });
}

export async function deleteAnnouncement(db: Db, coachId: string, id: string): Promise<void> {
  const { program } = await getOwnedAnnouncement(db, coachId, id);
  assertWritable(program);
  await db.$transaction([
    db.notification.deleteMany({ where: { kind: "announcement", entityId: id } }),
    db.announcement.delete({ where: { id } }),
  ]);
}

/**
 * The board of a program, newest first. Readable by its coach, or by an athlete with an active enrollment (archived programs are gone for athletes);
 * anyone else gets `not_found`. `writable` is for the coach of a live program.
 */
export async function listBoard(
  db: Db, viewer: { coachId: string } | { athleteId: string }, programId: string,
): Promise<{ program: Program; announcements: Announcement[]; writable: boolean }> {
  let program: Program | null;
  if ("coachId" in viewer) {
    program = await getOwnedProgram(db, viewer.coachId, programId);
  } else {
    program = await db.program.findUnique({ where: { id: programId } });
    if (!program || program.archivedAt || (await getEnrollmentStatus(db, viewer.athleteId, programId)) !== "active") {
      throw new TrainingError("not_found");
    }
  }
  const announcements = await db.announcement.findMany({ where: { programId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  return { program, announcements, writable: "coachId" in viewer && program.coachId !== null && program.archivedAt === null };
}
