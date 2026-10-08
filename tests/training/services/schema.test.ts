import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { enroll, makeAthlete, makeCoach, makeContinuous, makeCustomBlock } from "../../helpers/factories";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

describe("coaching schema", () => {
  it("allows one enrollment per athlete and program", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await enroll(tdb.prisma, program.id, athlete.id);
    await expect(enroll(tdb.prisma, program.id, athlete.id)).rejects.toMatchObject({ code: "P2002" });
  });

  it("cascades a program's deletion to its blocks, enrollments and results", async () => {
    const coach = await makeCoach(tdb.prisma);
    const athlete = await makeAthlete(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id);
    await enroll(tdb.prisma, program.id, athlete.id);
    const block = await makeCustomBlock(tdb.prisma, program.id, 0);
    await tdb.prisma.result.create({
      data: {
        blockId: block.id, athleteId: athlete.id, division: "rx", score: { seconds: 300 }, sortKey: -300,
        performedOn: new Date("2026-10-05T00:00:00Z"),
      },
    });
    await tdb.prisma.program.delete({ where: { id: program.id } });
    expect(await tdb.prisma.block.count()).toBe(0);
    expect(await tdb.prisma.enrollment.count()).toBe(0);
    expect(await tdb.prisma.result.count()).toBe(0);
  });

  it("stores calendar dates without a time zone shift", async () => {
    const coach = await makeCoach(tdb.prisma);
    const program = await makeContinuous(tdb.prisma, coach.id, "2026-10-26");
    const read = await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } });
    expect(read.startDate?.toISOString().slice(0, 10)).toBe("2026-10-26");
  });
});
