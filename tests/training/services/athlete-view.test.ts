import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { enroll, makeAthlete, makeClosed, makeCoach, makeContinuous, makeCustomBlock, publishWeek } from "../../helpers/factories";
import { getAthleteDay, getVisibleDays, loadAthleteTimeline } from "@/lib/training/services/athlete-view";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

async function continuousSetup() {
  const coach = await makeCoach(tdb.prisma);
  const athlete = await makeAthlete(tdb.prisma);
  const program = await makeContinuous(tdb.prisma, coach.id, "2026-10-05");
  await enroll(tdb.prisma, program.id, athlete.id);
  return { coach, athlete, program };
}

describe("athlete view", () => {
  it("shows the blocks of a published day in order, loggable once the day arrives", async () => {
    const { athlete, program } = await continuousSetup();
    await makeCustomBlock(tdb.prisma, program.id, 2, { position: 1, title: "B" });
    await makeCustomBlock(tdb.prisma, program.id, 2, { position: 0, title: "A" });
    await publishWeek(tdb.prisma, program.id, 0);
    const day = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-07", "2026-10-07");
    expect(day.status).toBe("ok");
    expect(day.loggable).toBe(true);
    expect(day.blocks.map((b) => b.title)).toEqual(["A", "B"]);
    const tomorrow = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-08", "2026-10-07");
    expect(tomorrow.loggable).toBe(false);
  });

  it("hides unpublished weeks and reports dates before the start", async () => {
    const { athlete, program } = await continuousSetup();
    await makeCustomBlock(tdb.prisma, program.id, 8);
    const unpublished = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-13", "2026-10-13");
    expect(unpublished).toMatchObject({ status: "unpublished", blocks: [] });
    const before = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-01", "2026-10-01");
    expect(before.status).toBe("before_start");
  });

  it("runs closed programs from the athlete's own start and finishes them", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeClosed(tdb.prisma, coach.id, 1, true);
    await enroll(tdb.prisma, program.id, athlete.id, "2026-10-08");
    await makeCustomBlock(tdb.prisma, program.id, 0, { title: "Day 1" });
    const first = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-08", "2026-10-08");
    expect(first.blocks.map((b) => b.title)).toEqual(["Day 1"]);
    const after = await getAthleteDay(tdb.prisma, athlete.id, program.id, "2026-10-15", "2026-10-15");
    expect(after.status).toBe("finished");
  });

  it("refuses programs the athlete does not follow", async () => {
    const { program } = await continuousSetup();
    const stranger = await makeAthlete(tdb.prisma);
    await expect(loadAthleteTimeline(tdb.prisma, stranger.id, program.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("lists the visible days of a range", async () => {
    const { athlete, program } = await continuousSetup();
    await makeCustomBlock(tdb.prisma, program.id, 0);
    await makeCustomBlock(tdb.prisma, program.id, 2);
    await makeCustomBlock(tdb.prisma, program.id, 9); // week 1, unpublished
    await publishWeek(tdb.prisma, program.id, 0);
    const days = await getVisibleDays(tdb.prisma, athlete.id, program.id, "2026-10-01", "2026-10-18");
    expect([...days].sort()).toEqual(["2026-10-05", "2026-10-07"]);
  });
});
