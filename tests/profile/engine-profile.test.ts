import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { emptyProfile, emptyStoredProfile, type StoredProfile } from "@/lib/engine/types";
import { toJson } from "@/lib/json";
import { loadEngineProfile } from "@/lib/tailor-service";
import { createTestDb, type TestDb } from "../helpers/db";
import { makeAthlete } from "../helpers/factories";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function store(userId: string, profile: StoredProfile & { benchmarks?: unknown }) {
  await tdb.prisma.athleteProfile.create({ data: { userId, data: toJson(profile) } });
}

describe("loadEngineProfile", () => {
  it("builds the benchmarks from the best record of each kind, ignoring stored ones", async () => {
    const athlete = await makeAthlete(tdb.prisma);
    await store(athlete.userId, {
      ...emptyStoredProfile(), sex: "female",
      benchmarks: [{ movement: "Test Back Squat", kind: "1rm", value: 200, unit: "kg", recordedAt: null }],
    });
    const at = (movement: string, kind: "lift" | "reps" | "distance" | "time", fields: object, on = "2026-09-01") =>
      ({ athleteId: athlete.id, movement, kind, achievedOn: day(on), ...fields });
    await tdb.prisma.personalRecord.createMany({ data: [
      at("Test Back Squat", "lift", { kg: 95, reps: 3 }, "2026-10-01"),
      at("Test Back Squat", "lift", { kg: 100, reps: 1 }),
      at("Test Pull-up", "reps", { reps: 18 }),
      at("Test Pull-up", "reps", { reps: 20 }, "2026-10-02"),
      at("Test Pull-up", "reps", { reps: 8, kg: 20 }),
      at("Test Row", "time", { distanceM: 2000, seconds: 430 }),
      at("Test Row", "time", { distanceM: 2000, seconds: 425 }, "2026-10-03"),
      at("Test Row", "time", { calories: 50, seconds: 160 }),
      at("Test Walk", "distance", { distanceM: 20 }),
      at("Test Walk", "distance", { distanceM: 25 }, "2026-10-04"),
    ] });
    const profile = await loadEngineProfile(tdb.prisma, athlete.userId);
    expect(profile.sex).toBe("female");
    expect(profile.benchmarks).toEqual(expect.arrayContaining([
      { movement: "Test Back Squat", kind: "1rm", value: 104.5, unit: "kg", estimated: true, recordedAt: "2026-10-01" },
      { movement: "Test Pull-up", kind: "max_reps", value: 20, unit: "reps", addedKg: null, recordedAt: "2026-10-02" },
      { movement: "Test Pull-up", kind: "max_reps", value: 8, unit: "reps", addedKg: 20, recordedAt: "2026-09-01" },
      { movement: "Test Row", kind: "time", value: 425, unit: "seconds", distanceM: 2000, recordedAt: "2026-10-03" },
      { movement: "Test Row", kind: "time", value: 160, unit: "seconds", calories: 50, recordedAt: "2026-09-01" },
      { movement: "Test Walk", kind: "max_distance", value: 25, unit: "meters", recordedAt: "2026-10-04" },
    ]));
    expect(profile.benchmarks).toHaveLength(6);
  });

  it("works without a stored profile or an athlete account", async () => {
    const athlete = await makeAthlete(tdb.prisma);
    expect(await loadEngineProfile(tdb.prisma, athlete.userId)).toEqual(emptyProfile());
    expect(await loadEngineProfile(tdb.prisma, "test-no-athlete")).toEqual(emptyProfile());
  });
});
