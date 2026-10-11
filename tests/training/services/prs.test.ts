import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeAthlete } from "../../helpers/factories";
import { addPr, deletePr, listMovementPrs, listPrs, oneRmMap } from "@/lib/training/services/prs";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("PRs", () => {
  it("adds catalog barbell PRs only and keeps the history", async () => {
    const a = await makeAthlete(tdb.prisma);
    await addPr(tdb.prisma, a.id, { movement: "Back Squat", kg: 140, achievedOn: "2026-06-01" });
    await addPr(tdb.prisma, a.id, { movement: "Back Squat", kg: 150, achievedOn: "2026-09-01" });
    await expect(addPr(tdb.prisma, a.id, { movement: "Air Squat", kg: 10, achievedOn: "2026-09-01" })).rejects.toMatchObject({ code: "invalid_request" });
    expect((await listMovementPrs(tdb.prisma, a.id, "Back Squat")).map((p) => p.kg)).toEqual([150, 140]);
    expect(await listPrs(tdb.prisma, a.id)).toHaveLength(2);
  });

  it("maps movements to their heaviest entry", async () => {
    const a = await makeAthlete(tdb.prisma);
    await addPr(tdb.prisma, a.id, { movement: "Back Squat", kg: 150, achievedOn: "2026-09-01" });
    await addPr(tdb.prisma, a.id, { movement: "Back Squat", kg: 145, achievedOn: "2026-10-01" });
    await addPr(tdb.prisma, a.id, { movement: "Deadlift", kg: 180, achievedOn: "2026-10-01" });
    const map = await oneRmMap(tdb.prisma, a.id, ["Back Squat", "Clean"]);
    expect([...map]).toEqual([["Back Squat", 150]]);
  });

  it("deletes only the athlete's own entries", async () => {
    const a = await makeAthlete(tdb.prisma);
    const b = await makeAthlete(tdb.prisma);
    const pr = await addPr(tdb.prisma, a.id, { movement: "Deadlift", kg: 180, achievedOn: "2026-10-01" });
    await expect(deletePr(tdb.prisma, b.id, pr.id)).rejects.toMatchObject({ code: "not_found" });
    await deletePr(tdb.prisma, a.id, pr.id);
    expect(await listPrs(tdb.prisma, a.id)).toHaveLength(0);
  });
});
