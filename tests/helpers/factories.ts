import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";

let seq = 0;
const next = () => `${++seq}-${Date.now().toString(36)}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function makeUser(db: PrismaClient, name = "User") {
  const id = next();
  return db.user.create({ data: { id: `user-${id}`, name: `${name} ${id}`, email: `${id}@test.local` } });
}

export async function makeCoach(db: PrismaClient, status: "pending" | "approved" | "suspended" = "approved") {
  const user = await makeUser(db, "Coach");
  return db.coachAccount.create({ data: { userId: user.id, displayName: user.name, status } });
}

export async function makeAthlete(db: PrismaClient, timezone = "Europe/Madrid") {
  const user = await makeUser(db, "Athlete");
  return db.athleteAccount.create({ data: { userId: user.id, displayName: user.name, timezone } });
}

export async function makeContinuous(db: PrismaClient, coachId: string, startDate = "2026-10-05") {
  return db.program.create({
    data: { coachId, name: "Daily", kind: "continuous", startDate: day(startDate), inviteCode: `inv-${next()}` },
  });
}

export async function makeClosed(db: PrismaClient, coachId: string, weeks = 4, published = true) {
  return db.program.create({
    data: {
      coachId, name: "Cycle", kind: "closed", weeks, inviteCode: `inv-${next()}`,
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
  db: PrismaClient, programId: string, dayIndex: number, movement = "Back Squat",
  sets: { reps: number; percent: number | null; kg: number | null }[] = [{ reps: 5, percent: 80, kg: null }],
) {
  return db.block.create({
    data: {
      programId, dayIndex, position: 0, kind: "barbell", color: "neutral", movement,
      sets: sets as Prisma.InputJsonValue,
    },
  });
}
