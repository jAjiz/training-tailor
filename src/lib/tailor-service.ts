import { prisma } from "@/lib/db";
import type { AthleteProfile, Benchmark } from "@/lib/engine/types";
import { normalizeProfile } from "@/lib/profile";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import { listPrs } from "@/lib/training/services/prs";
import type { Db } from "@/lib/training/services/types";

export async function loadProfile(userId: string): Promise<AthleteProfile> {
  const row = await prisma.athleteProfile.findUnique({ where: { userId } });
  return normalizeProfile(row?.data);
}

/**
 * The profile the engine reads: the stored one without its `1rm` benchmarks, plus the athlete's current PR per
 * movement (the highest kg, the latest on a tie). PRs are the single source for 1RM; stored `1rm` benchmarks are ignored.
 */
export async function loadEngineProfile(db: Db, userId: string): Promise<AthleteProfile> {
  const [row, athlete] = await Promise.all([db.athleteProfile.findUnique({ where: { userId } }), getAthleteByUserId(db, userId)]);
  const profile = normalizeProfile(row?.data);
  const current = new Map<string, Benchmark>();
  for (const pr of athlete ? await listPrs(db, athlete.id) : []) {
    if ((current.get(pr.movement)?.value ?? 0) >= pr.kg) continue; // rows come latest first
    current.set(pr.movement, {
      movement: pr.movement, kind: "1rm", value: pr.kg, unit: "kg", recordedAt: pr.achievedOn.toISOString().slice(0, 10),
    });
  }
  return { ...profile, benchmarks: [...profile.benchmarks.filter((b) => b.kind !== "1rm"), ...current.values()] };
}
