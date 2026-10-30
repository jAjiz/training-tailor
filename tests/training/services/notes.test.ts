import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeClosed, makeCoach, makeContinuous } from "../../helpers/factories";
import { listWeekNotes, setDayNote, setWeekNote } from "@/lib/training/services/notes";
import { archiveProgram } from "@/lib/training/services/programs";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

async function setup() {
  const coach = await makeCoach(tdb.prisma);
  const program = await makeContinuous(tdb.prisma, coach.id);
  return { coach, program };
}

describe("notes", () => {
  it("saves, replaces and deletes a day note", async () => {
    const { coach, program } = await setup();
    await setDayNote(tdb.prisma, coach.id, program.id, 3, "Test goal");
    expect((await listWeekNotes(tdb.prisma, program.id, 0)).days.get(3)).toBe("Test goal");
    await setDayNote(tdb.prisma, coach.id, program.id, 3, "Test other");
    expect((await listWeekNotes(tdb.prisma, program.id, 0)).days.get(3)).toBe("Test other");
    await setDayNote(tdb.prisma, coach.id, program.id, 3, null);
    expect((await listWeekNotes(tdb.prisma, program.id, 0)).days.has(3)).toBe(false);
  });

  it("saves a week note", async () => {
    const { coach, program } = await setup();
    await setWeekNote(tdb.prisma, coach.id, program.id, 1, "Test week");
    expect((await listWeekNotes(tdb.prisma, program.id, 1)).week).toBe("Test week");
    expect((await listWeekNotes(tdb.prisma, program.id, 0)).week).toBeNull();
    await setWeekNote(tdb.prisma, coach.id, program.id, 1, null);
    expect((await listWeekNotes(tdb.prisma, program.id, 1)).week).toBeNull();
  });

  it("lists only the days of the requested week", async () => {
    const { coach, program } = await setup();
    await setDayNote(tdb.prisma, coach.id, program.id, 6, "Test last");
    await setDayNote(tdb.prisma, coach.id, program.id, 7, "Test next");
    const { days } = await listWeekNotes(tdb.prisma, program.id, 0);
    expect([...days.keys()]).toEqual([6]);
  });

  it("checks owner, archive and range", async () => {
    const { coach, program } = await setup();
    const other = await makeCoach(tdb.prisma);
    const closed = await makeClosed(tdb.prisma, coach.id, 2);
    await expect(setDayNote(tdb.prisma, other.id, program.id, 0, "Test")).rejects.toMatchObject({ code: "not_found" });
    await expect(setWeekNote(tdb.prisma, other.id, program.id, 0, "Test")).rejects.toMatchObject({ code: "not_found" });
    await expect(setDayNote(tdb.prisma, coach.id, closed.id, 14, "Test")).rejects.toMatchObject({ code: "day_out_of_range" });
    await expect(setWeekNote(tdb.prisma, coach.id, closed.id, 2, "Test")).rejects.toMatchObject({ code: "day_out_of_range" });
    await expect(setDayNote(tdb.prisma, coach.id, program.id, -1, "Test")).rejects.toMatchObject({ code: "day_out_of_range" });
    await archiveProgram(tdb.prisma, coach.id, program.id);
    await expect(setDayNote(tdb.prisma, coach.id, program.id, 0, "Test")).rejects.toMatchObject({ code: "program_archived" });
    await expect(setWeekNote(tdb.prisma, coach.id, program.id, 0, "Test")).rejects.toMatchObject({ code: "program_archived" });
  });

  it("cascades with the program", async () => {
    const { coach, program } = await setup();
    await setDayNote(tdb.prisma, coach.id, program.id, 0, "Test day");
    await setWeekNote(tdb.prisma, coach.id, program.id, 0, "Test week");
    await tdb.prisma.program.delete({ where: { id: program.id } });
    expect(await tdb.prisma.dayNote.count()).toBe(0);
    expect(await tdb.prisma.weekNote.count()).toBe(0);
  });
});
