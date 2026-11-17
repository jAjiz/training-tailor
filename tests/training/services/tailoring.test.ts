import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { enroll, leave, makeAthlete, makeCoach, makeContinuous, makeCustomBlock, publishWeek } from "../../helpers/factories";
import { getAdaptableBlock, isAdaptableDay, setProgramTailoring, tailoringOn } from "@/lib/training/services/tailoring";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb({ library: false }); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const DAY0 = new Date("2026-10-05T10:00:00Z"); // Monday, day 0 of the program
const DAY1 = new Date("2026-10-06T10:00:00Z");

async function setup(opts: { coachOn?: boolean; programOn?: boolean } = {}) {
  const { coachOn = true, programOn = true } = opts;
  const coach = await makeCoach(tdb.prisma);
  await tdb.prisma.coachAccount.update({ where: { id: coach.id }, data: { tailoringEnabled: coachOn } });
  const program = await makeContinuous(tdb.prisma, coach.id, "2026-10-05");
  await tdb.prisma.program.update({ where: { id: program.id }, data: { tailoringEnabled: programOn } });
  await publishWeek(tdb.prisma, program.id, 0);
  const athlete = await makeAthlete(tdb.prisma);
  const enrollment = await enroll(tdb.prisma, program.id, athlete.id);
  const [b0, b1] = [await makeCustomBlock(tdb.prisma, program.id, 0), await makeCustomBlock(tdb.prisma, program.id, 1)];
  return { coach, program, athlete, enrollment, b0, b1 };
}

describe("getAdaptableBlock", () => {
  it("adaptable when coach and program are on, for today and later", async () => {
    const { athlete, b0, b1 } = await setup();
    expect(await getAdaptableBlock(tdb.prisma, athlete, b0.id, DAY0)).toMatchObject({ date: "2026-10-05", block: { id: b0.id, program: { coach: { tailoringEnabled: true } } } });
    expect((await getAdaptableBlock(tdb.prisma, athlete, b1.id, DAY0)).date).toBe("2026-10-06");
    expect((await getAdaptableBlock(tdb.prisma, athlete, b1.id, DAY1)).block.id).toBe(b1.id);
    await expect(getAdaptableBlock(tdb.prisma, athlete, b0.id, DAY1)).rejects.toMatchObject({ code: "day_passed" });
  });

  it("tailoring_off when the coach switch is off", async () => {
    const { athlete, b0 } = await setup({ coachOn: false });
    await expect(getAdaptableBlock(tdb.prisma, athlete, b0.id, DAY0)).rejects.toMatchObject({ code: "tailoring_off" });
  });

  it("tailoring_off when the program switch is off", async () => {
    const { athlete, b0 } = await setup({ programOn: false });
    await expect(getAdaptableBlock(tdb.prisma, athlete, b0.id, DAY0)).rejects.toMatchObject({ code: "tailoring_off" });
  });

  it("tailoring_off when the coach is suspended", async () => {
    const { coach, athlete, b0 } = await setup();
    await tdb.prisma.coachAccount.update({ where: { id: coach.id }, data: { status: "suspended" } });
    await expect(getAdaptableBlock(tdb.prisma, athlete, b0.id, DAY0)).rejects.toMatchObject({ code: "tailoring_off" });
  });

  it("an archived program is not adaptable (not_found from the visibility rule, off by tailoringOn)", async () => {
    const { program, athlete, b0 } = await setup();
    await tdb.prisma.program.update({ where: { id: program.id }, data: { archivedAt: new Date() } });
    await expect(getAdaptableBlock(tdb.prisma, athlete, b0.id, DAY0)).rejects.toMatchObject({ code: "not_found" });
    expect(tailoringOn({ tailoringEnabled: true, archivedAt: new Date(), coach: { tailoringEnabled: true, status: "approved" } })).toBe(false);
  });

  it("not_found for a removed athlete", async () => {
    const { athlete, enrollment, b0 } = await setup();
    await leave(tdb.prisma, enrollment.id);
    await expect(getAdaptableBlock(tdb.prisma, athlete, b0.id, DAY0)).rejects.toMatchObject({ code: "not_found" });
    const stranger = await makeAthlete(tdb.prisma);
    await expect(getAdaptableBlock(tdb.prisma, stranger, b0.id, DAY0)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("tailoringOn and isAdaptableDay", () => {
  it("needs both switches, an approved coach and an unarchived program", () => {
    const on = { tailoringEnabled: true, archivedAt: null, coach: { tailoringEnabled: true, status: "approved" } };
    expect(tailoringOn(on)).toBe(true);
    expect(tailoringOn({ ...on, tailoringEnabled: false })).toBe(false);
    expect(tailoringOn({ ...on, coach: { tailoringEnabled: false, status: "approved" } })).toBe(false);
    expect(tailoringOn({ ...on, coach: null })).toBe(false);
  });

  it("is adaptable from today on", () => {
    expect(isAdaptableDay("2026-10-05", "2026-10-05")).toBe(true);
    expect(isAdaptableDay("2026-10-06", "2026-10-05")).toBe(true);
    expect(isAdaptableDay("2026-10-04", "2026-10-05")).toBe(false);
  });
});

describe("setProgramTailoring", () => {
  it("refuses when the coach is not enabled, but turning off is always allowed", async () => {
    const { coach, program } = await setup({ coachOn: false, programOn: true });
    await expect(setProgramTailoring(tdb.prisma, coach.id, program.id, true)).rejects.toMatchObject({ code: "tailoring_not_allowed" });
    await setProgramTailoring(tdb.prisma, coach.id, program.id, false);
    expect((await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).tailoringEnabled).toBe(false);
  });

  it("turns on for an enabled coach, refuses archived programs and other coaches' programs", async () => {
    const { coach, program } = await setup({ programOn: false });
    await setProgramTailoring(tdb.prisma, coach.id, program.id, true);
    expect((await tdb.prisma.program.findUniqueOrThrow({ where: { id: program.id } })).tailoringEnabled).toBe(true);
    const other = await makeCoach(tdb.prisma);
    await expect(setProgramTailoring(tdb.prisma, other.id, program.id, false)).rejects.toMatchObject({ code: "not_found" });
    await tdb.prisma.program.update({ where: { id: program.id }, data: { archivedAt: new Date() } });
    await expect(setProgramTailoring(tdb.prisma, coach.id, program.id, false)).rejects.toMatchObject({ code: "program_archived" });
  });
});
