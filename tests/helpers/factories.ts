import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

let seq = 0;
const next = () => `${++seq}-${Date.now().toString(36)}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function makeUser(db: PrismaClient, name = "User") {
  const id = next();
  return db.user.create({ data: { id: `user-${id}`, name: `${name} ${id}`, email: `${id}@test.local` } });
}

export async function makeAdmin(db: PrismaClient) {
  const user = await makeUser(db, "Admin");
  return db.user.update({ where: { id: user.id }, data: { role: "admin" } });
}

export async function makeCoach(db: PrismaClient, status: "pending" | "approved" | "rejected" | "suspended" = "approved") {
  const user = await makeUser(db, "Coach");
  return db.coachAccount.create({ data: { userId: user.id, displayName: user.name, status } });
}

export async function makeAthlete(db: PrismaClient, timezone = "Europe/Madrid") {
  const user = await makeUser(db, "Athlete");
  return db.athleteAccount.create({ data: { userId: user.id, displayName: user.name, timezone } });
}

/** Like `createProgram`: the program copies its coach's display name. */
async function coachNameOf(db: PrismaClient, coachId: string) {
  return (await db.coachAccount.findUniqueOrThrow({ where: { id: coachId } })).displayName;
}

export async function makeContinuous(db: PrismaClient, coachId: string, startDate = "2026-10-05") {
  const coachName = await coachNameOf(db, coachId);
  return db.program.create({
    data: { coachId, coachName, name: "Daily", kind: "continuous", startDate: day(startDate), inviteCode: `inv-${next()}` },
  });
}

export async function makeClosed(db: PrismaClient, coachId: string, weeks = 4, published = true) {
  const coachName = await coachNameOf(db, coachId);
  return db.program.create({
    data: {
      coachId, coachName, name: "Cycle", kind: "closed", weeks, inviteCode: `inv-${next()}`,
      publishedAt: published ? new Date() : null,
    },
  });
}

export async function publishWeek(db: PrismaClient, programId: string, weekIndex: number) {
  await db.programWeek.create({ data: { programId, weekIndex } });
}

export async function enroll(db: PrismaClient, programId: string, athleteId: string, startDate: string | null = null) {
  return db.enrollment.create({ data: { programId, athleteId, startDate: startDate ? day(startDate) : null } });
}

export async function makeCustomBlock(
  db: PrismaClient, programId: string, dayIndex: number,
  overrides: Partial<{ scoring: string; timeCapSeconds: number | null; position: number; title: string }> = {},
) {
  return db.block.create({
    data: {
      programId, dayIndex, position: overrides.position ?? 0, kind: "custom", color: "neutral",
      title: overrides.title ?? "WOD", description: "21-15-9 thrusters and pull-ups",
      scoring: overrides.scoring ?? "for_time", timeCapSeconds: overrides.timeCapSeconds ?? null,
    },
  });
}

export async function makeBarbellBlock(
  db: PrismaClient, programId: string, dayIndex: number, movement = "Test Back Squat",
  sets: { reps: number; percent: number | null; kg: number | null }[] = [{ reps: 5, percent: 80, kg: null }],
) {
  return db.block.create({
    data: {
      programId, dayIndex, position: 0, kind: "barbell", color: "neutral", movement,
      sets: sets as Prisma.InputJsonValue,
    },
  });
}

export async function makeResult(db: PrismaClient, blockId: string, athleteId: string, performedOn = "2026-10-05") {
  return db.result.create({
    data: { blockId, athleteId, division: "rx", score: { seconds: 300 }, sortKey: -300, performedOn: day(performedOn) },
  });
}

export async function makeAnnouncement(db: PrismaClient, programId: string, body = "Hola") {
  return db.announcement.create({ data: { programId, body } });
}

export async function makeSubscription(db: PrismaClient, userId: string, endpoint = `https://push.test/${next()}`) {
  return db.pushSubscription.create({ data: { userId, endpoint, p256dh: "p256dh", auth: "auth" } });
}

/** The athlete leaves the program (`leftAt = now`). */
export async function leave(db: PrismaClient, enrollmentId: string) {
  return db.enrollment.update({ where: { id: enrollmentId }, data: { leftAt: new Date() } });
}
