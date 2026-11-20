import { prisma } from "@/lib/db";
import type { AthleteProfile, Benchmark, StoredProfile } from "@/lib/engine/types";
import { normalizeProfile } from "@/lib/profile";
import { bestByLoad, bestByTarget, bestDistance, targetOf } from "@/lib/training/records";
import type { CardioTarget } from "@/lib/domain/types";
import { getAthleteByUserId } from "@/lib/training/services/accounts";
import { liftOneRms, listPrs } from "@/lib/training/services/prs";
import type { Db } from "@/lib/training/services/types";

export async function loadProfile(userId: string): Promise<StoredProfile> {
  const row = await prisma.athleteProfile.findUnique({ where: { userId } });
  return normalizeProfile(row?.data);
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The profile the engine reads: the stored one plus benchmarks from the athlete's records (which always fit the catalog):
 * the current 1RM per lift, the most reps per gymnastic movement and added load, the longest unbroken distance, and the
 * best time per cardio target.
 */
export async function loadEngineProfile(db: Db, userId: string): Promise<AthleteProfile> {
  const [row, athlete] = await Promise.all([db.athleteProfile.findUnique({ where: { userId } }), getAthleteByUserId(db, userId)]);
  const profile = normalizeProfile(row?.data);
  const records = athlete ? await listPrs(db, athlete.id) : [];
  const benchmarks: Benchmark[] = [];
  for (const [movement, r] of liftOneRms(records)) {
    benchmarks.push({ movement, kind: "1rm", value: r.kg, unit: "kg", estimated: r.estimated, recordedAt: isoDay(r.achievedOn) });
  }
  const byMovement = new Map<string, typeof records>();
  for (const r of records) byMovement.set(r.movement, [...(byMovement.get(r.movement) ?? []), r]);
  for (const [movement, rows] of byMovement) {
    const reps = rows.flatMap((r) => (r.kind === "reps" && r.reps !== null ? [{ reps: r.reps, kg: r.kg, achievedOn: r.achievedOn }] : []));
    for (const r of bestByLoad(reps)) {
      benchmarks.push({ movement, kind: "max_reps", value: r.reps, unit: "reps", addedKg: r.kg, recordedAt: isoDay(r.achievedOn) });
    }
    const longest = bestDistance(rows.flatMap((r) => (r.kind === "distance" && r.distanceM !== null
      ? [{ distanceM: r.distanceM, achievedOn: r.achievedOn }] : [])));
    if (longest) {
      benchmarks.push({ movement, kind: "max_distance", value: longest.distanceM, unit: "meters", recordedAt: isoDay(longest.achievedOn) });
    }
    const times = rows.flatMap((r) => (r.kind === "time" && r.seconds !== null
      ? [{ distanceM: r.distanceM, calories: r.calories, seconds: r.seconds, achievedOn: r.achievedOn }] : []));
    const targets = new Map<string, CardioTarget>();
    for (const r of times) {
      const t = targetOf(r);
      if (t) targets.set(JSON.stringify(t), t);
    }
    for (const r of bestByTarget(times, [...targets.values()])) {
      benchmarks.push({ movement, kind: "time", value: r.seconds, unit: "seconds", ...targetOf(r), recordedAt: isoDay(r.achievedOn) });
    }
  }
  return { ...profile, benchmarks };
}
