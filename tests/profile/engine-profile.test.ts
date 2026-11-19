import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { emptyProfile, type AthleteProfile, type Benchmark } from "@/lib/engine/types";
import { toJson } from "@/lib/json";
import { loadEngineProfile } from "@/lib/tailor-service";
import { createTestDb, type TestDb } from "../helpers/db";
import { makeAthlete } from "../helpers/factories";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const bench = (patch: Partial<Benchmark>): Benchmark => ({
  movement: "Test Squat", kind: "1rm", value: 90, unit: "kg", recordedAt: null, ...patch,
});
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function store(userId: string, profile: AthleteProfile) {
  await tdb.prisma.athleteProfile.create({ data: { userId, data: toJson(profile) } });
}

describe("loadEngineProfile", () => {
  it("replaces stored 1rm benchmarks with PRs", async () => {
    const athlete = await makeAthlete(tdb.prisma);
    await store(athlete.userId, { ...emptyProfile(), benchmarks: [bench({ value: 90 }), bench({ movement: "Test Press", value: 40 })] });
    await tdb.prisma.personalRecord.createMany({ data: [
      { athleteId: athlete.id, movement: "Test Squat", kind: "lift", kg: 100, reps: 1, achievedOn: day("2026-09-01") },
      { athleteId: athlete.id, movement: "Test Squat", kind: "lift", kg: 110, reps: 1, achievedOn: day("2026-10-01") },
      { athleteId: athlete.id, movement: "Test Deadlift", kind: "lift", kg: 150, reps: 1, achievedOn: day("2026-09-15") },
    ] });
    const { benchmarks } = await loadEngineProfile(tdb.prisma, athlete.userId);
    expect(benchmarks).toHaveLength(2);
    expect(benchmarks).toEqual(expect.arrayContaining([
      { movement: "Test Squat", kind: "1rm", value: 110, unit: "kg", recordedAt: "2026-10-01" },
      { movement: "Test Deadlift", kind: "1rm", value: 150, unit: "kg", recordedAt: "2026-09-15" },
    ]));
  });

  it("keeps max_reps and time benchmarks", async () => {
    const athlete = await makeAthlete(tdb.prisma);
    const reps = bench({ movement: "Test Pull-up", kind: "max_reps", value: 12, unit: "reps" });
    const time = bench({ movement: "Test Row", kind: "time", value: 400, unit: "seconds" });
    await store(athlete.userId, { ...emptyProfile(), sex: "female", benchmarks: [reps, bench({}), time] });
    const profile = await loadEngineProfile(tdb.prisma, athlete.userId);
    expect(profile.benchmarks).toEqual([reps, time]);
    expect(profile.sex).toBe("female");
  });

  it("works without a stored profile", async () => {
    const athlete = await makeAthlete(tdb.prisma);
    expect(await loadEngineProfile(tdb.prisma, athlete.userId)).toEqual(emptyProfile());
    await tdb.prisma.personalRecord.create({
      data: { athleteId: athlete.id, movement: "Test Squat", kind: "lift", kg: 100, reps: 1, achievedOn: day("2026-09-01") },
    });
    const { benchmarks } = await loadEngineProfile(tdb.prisma, athlete.userId);
    expect(benchmarks).toEqual([{ movement: "Test Squat", kind: "1rm", value: 100, unit: "kg", recordedAt: "2026-09-01" }]);
  });
});
