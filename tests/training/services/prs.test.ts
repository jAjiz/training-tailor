import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeAthlete } from "../../helpers/factories";
import { PrInput } from "@/lib/training/schemas";
import { addPr, deletePr, listMovementPrs, listPrs, oneRmMap } from "@/lib/training/services/prs";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const lift = (movement: string, kg: number, reps: number, achievedOn = "2026-09-01") => ({ kind: "lift" as const, movement, kg, reps, achievedOn });

describe("records", () => {
  it("adds lifts on barbell movements only and keeps the history", async () => {
    const a = await makeAthlete(tdb.prisma);
    await addPr(tdb.prisma, a, lift("Test Back Squat", 140, 1, "2026-06-01"));
    await addPr(tdb.prisma, a, lift("Test Back Squat", 130, 3, "2026-09-01"));
    await expect(addPr(tdb.prisma, a, lift("Test Air Squat", 10, 1))).rejects.toMatchObject({ code: "invalid_request" });
    expect((await listMovementPrs(tdb.prisma, a.id, "Test Back Squat")).map((p) => [p.kg, p.reps])).toEqual([[130, 3], [140, 1]]);
    expect(await listPrs(tdb.prisma, a.id)).toHaveLength(2);
  });

  it("stores bodyweight and weighted reps, distances, and times over a distance or calories", async () => {
    const a = await makeAthlete(tdb.prisma);
    await addPr(tdb.prisma, a, { kind: "reps", movement: "Test Pull-up", reps: 18, kg: null, achievedOn: "2026-09-01" });
    await addPr(tdb.prisma, a, { kind: "reps", movement: "Test Pull-up", reps: 8, kg: 20, achievedOn: "2026-09-02" });
    await addPr(tdb.prisma, a, { kind: "distance", movement: "Test Walk", distanceM: 25, achievedOn: "2026-09-02" });
    await addPr(tdb.prisma, a, { kind: "time", movement: "Test Row", distanceM: 2000, seconds: 425, achievedOn: "2026-09-03" });
    await addPr(tdb.prisma, a, { kind: "time", movement: "Test Row", calories: 50, seconds: 160, achievedOn: "2026-09-04" });
    const rows = await listPrs(tdb.prisma, a.id);
    expect(rows.map((r) => [r.movement, r.kind, r.kg, r.reps, r.distanceM, r.calories, r.seconds])).toEqual([
      ["Test Pull-up", "reps", 20, 8, null, null, null],
      ["Test Pull-up", "reps", null, 18, null, null, null],
      ["Test Row", "time", null, null, null, 50, 160],
      ["Test Row", "time", null, null, 2000, null, 425],
      ["Test Walk", "distance", null, null, 25, null, null],
    ]);
  });

  it("refuses a record that doesn't fit the movement's catalog entry", async () => {
    const a = await makeAthlete(tdb.prisma);
    const refused = (input: Parameters<typeof addPr>[2]) =>
      expect(addPr(tdb.prisma, a, input)).rejects.toMatchObject({ code: "invalid_request" });
    // the wrong kind
    await refused({ kind: "reps", movement: "Test Back Squat", reps: 10, kg: null, achievedOn: "2026-09-01" });
    // a load on an unweighted entry
    await refused({ kind: "reps", movement: "Test Air Squat", reps: 50, kg: 10, achievedOn: "2026-09-01" });
    // a target the entry doesn't list
    await refused({ kind: "time", movement: "Test Row", distanceM: 1000, seconds: 200, achievedOn: "2026-09-01" });
    await refused({ kind: "time", movement: "Test Row", calories: 100, seconds: 400, achievedOn: "2026-09-01" });
    // a movement outside the catalog, barbell or not
    await refused({ kind: "reps", movement: "Test DB Snatch", reps: 10, kg: null, achievedOn: "2026-09-01" });
  });

  it("checks the shape of each kind", () => {
    const time = (over: object) => ({ kind: "time", movement: "Test Row", seconds: 300, achievedOn: "2026-09-01", ...over });
    expect(PrInput.safeParse(lift("Test Back Squat", 100, 4)).success).toBe(false);
    expect(PrInput.safeParse(lift("Test Back Squat", 100, 5)).success).toBe(true);
    expect(PrInput.safeParse(time({ distanceM: 2000 })).success).toBe(true);
    expect(PrInput.safeParse(time({ calories: 50 })).success).toBe(true);
    expect(PrInput.safeParse(time({ distanceM: 2000, calories: 50 })).success).toBe(false);
    expect(PrInput.safeParse(time({})).success).toBe(false);
    expect(PrInput.safeParse({ kind: "distance", movement: "Test Walk", distanceM: 1001, achievedOn: "2026-09-01" }).success).toBe(false);
    expect(PrInput.safeParse({ kind: "reps", movement: "Test Pull-up", reps: 0, kg: null, achievedOn: "2026-09-01" }).success).toBe(false);
  });

  it("refuses records dated after the athlete's today", async () => {
    const a = await makeAthlete(tdb.prisma, "Pacific/Kiritimati"); // UTC+14
    const now = new Date("2026-10-16T12:00:00Z"); // already 2026-10-17 there
    await addPr(tdb.prisma, a, lift("Test Back Squat", 140, 1, "2026-10-17"), now);
    await expect(addPr(tdb.prisma, a, lift("Test Back Squat", 140, 1, "2026-10-18"), now))
      .rejects.toMatchObject({ code: "invalid_request" });
  });

  it("maps each lift to its current 1RM, estimated from multi-rep lifts", async () => {
    const a = await makeAthlete(tdb.prisma);
    await addPr(tdb.prisma, a, lift("Test Back Squat", 150, 1, "2026-09-01"));
    await addPr(tdb.prisma, a, lift("Test Back Squat", 145, 1, "2026-10-01"));
    await addPr(tdb.prisma, a, lift("Test Deadlift", 95, 3, "2026-10-01"));
    const map = await oneRmMap(tdb.prisma, a.id, ["Test Back Squat", "Test Deadlift", "Test Pull-up"]);
    expect(map.get("Test Back Squat")).toMatchObject({ kg: 150, estimated: false });
    expect(map.get("Test Deadlift")).toMatchObject({ kg: 104.5, estimated: true });
    expect(map.has("Test Pull-up")).toBe(false);
  });

  it("deletes only the athlete's own entries", async () => {
    const a = await makeAthlete(tdb.prisma);
    const b = await makeAthlete(tdb.prisma);
    const pr = await addPr(tdb.prisma, a, lift("Test Deadlift", 180, 1, "2026-10-01"));
    await expect(deletePr(tdb.prisma, b.id, pr.id)).rejects.toMatchObject({ code: "not_found" });
    await deletePr(tdb.prisma, a.id, pr.id);
    expect(await listPrs(tdb.prisma, a.id)).toHaveLength(0);
  });
});
