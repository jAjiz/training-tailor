import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeAthlete, makeClosed, makeCoach, makeContinuous, makeCustomBlock } from "../../helpers/factories";
import {
  createBlock, deleteBlock, duplicateBlock, duplicateDay, duplicateWeek, listWeekBlocks, moveBlock, updateBlock,
} from "@/lib/training/services/blocks";
import { archiveProgram } from "@/lib/training/services/programs";
import type { BlockInputValue } from "@/lib/training/schemas";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const custom = (title: string, scoring: "for_time" | "amrap" | "none" = "for_time"): BlockInputValue => ({
  kind: "custom", title, color: "neutral", coachingTips: null, videoUrl: null,
  description: "21-15-9", scoring, timeCapSeconds: null,
});
const barbell = (movement = "Back Squat"): BlockInputValue => ({
  kind: "barbell", title: null, color: "blue", coachingTips: null, videoUrl: null,
  movement, sets: [{ reps: 5, percent: 80, kg: null }], instructions: null,
});
const titles = async (programId: string, dayIndex: number) =>
  (await tdb.prisma.block.findMany({ where: { programId, dayIndex }, orderBy: { position: "asc" } })).map((b) => `${b.position}:${b.title ?? b.movement}`);

async function setup() {
  const coach = await makeCoach(tdb.prisma);
  const program = await makeContinuous(tdb.prisma, coach.id);
  return { coach, program };
}

describe("blocks", () => {
  it("appends blocks to the end of their day", async () => {
    const { coach, program } = await setup();
    await createBlock(tdb.prisma, coach.id, program.id, 2, custom("A"));
    await createBlock(tdb.prisma, coach.id, program.id, 2, barbell());
    expect(await titles(program.id, 2)).toEqual(["0:A", "1:Back Squat"]);
  });

  it("validates the movement, the day and the owner", async () => {
    const { coach, program } = await setup();
    const other = await makeCoach(tdb.prisma);
    const closed = await makeClosed(tdb.prisma, coach.id, 2);
    await expect(createBlock(tdb.prisma, coach.id, program.id, 0, barbell("Air Squat"))).rejects.toMatchObject({ code: "invalid_request" });
    await expect(createBlock(tdb.prisma, coach.id, program.id, -1, custom("A"))).rejects.toMatchObject({ code: "day_out_of_range" });
    await expect(createBlock(tdb.prisma, coach.id, closed.id, 14, custom("A"))).rejects.toMatchObject({ code: "day_out_of_range" });
    await expect(createBlock(tdb.prisma, other.id, program.id, 0, custom("A"))).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses changes on archived programs", async () => {
    const { coach, program } = await setup();
    await archiveProgram(tdb.prisma, coach.id, program.id);
    await expect(createBlock(tdb.prisma, coach.id, program.id, 0, custom("A"))).rejects.toMatchObject({ code: "program_archived" });
  });

  it("switches a block between kinds and clears the other kind's fields", async () => {
    const { coach, program } = await setup();
    const b = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("A"));
    const updated = await updateBlock(tdb.prisma, coach.id, b.id, barbell("Deadlift"));
    expect(updated).toMatchObject({ kind: "barbell", movement: "Deadlift", description: null, scoring: null });
  });

  it("locks the scoring once results exist", async () => {
    const { coach, program } = await setup();
    const athlete = await makeAthlete(tdb.prisma);
    const b = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("A", "for_time"));
    await tdb.prisma.result.create({
      data: { blockId: b.id, athleteId: athlete.id, division: "rx", score: { seconds: 300 }, sortKey: -300, performedOn: new Date("2026-10-05T00:00:00Z") },
    });
    await expect(updateBlock(tdb.prisma, coach.id, b.id, custom("A", "amrap"))).rejects.toMatchObject({ code: "scoring_locked" });
    await expect(updateBlock(tdb.prisma, coach.id, b.id, barbell())).rejects.toMatchObject({ code: "scoring_locked" });
    expect((await updateBlock(tdb.prisma, coach.id, b.id, custom("Renamed", "for_time"))).title).toBe("Renamed");
  });

  it("renumbers the day after a deletion", async () => {
    const { coach, program } = await setup();
    const a = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("A"));
    await createBlock(tdb.prisma, coach.id, program.id, 0, custom("B"));
    await createBlock(tdb.prisma, coach.id, program.id, 0, custom("C"));
    await deleteBlock(tdb.prisma, coach.id, a.id);
    expect(await titles(program.id, 0)).toEqual(["0:B", "1:C"]);
  });

  it("moves blocks within their day and to another day, renumbering both", async () => {
    const { coach, program } = await setup();
    const a = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("A"));
    const b = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("B"));
    await createBlock(tdb.prisma, coach.id, program.id, 0, custom("C"));
    await createBlock(tdb.prisma, coach.id, program.id, 1, custom("X"));
    await moveBlock(tdb.prisma, coach.id, a.id, 0, 2);
    expect(await titles(program.id, 0)).toEqual(["0:B", "1:C", "2:A"]);
    await moveBlock(tdb.prisma, coach.id, b.id, 1, 0);
    expect(await titles(program.id, 0)).toEqual(["0:C", "1:A"]);
    expect(await titles(program.id, 1)).toEqual(["0:B", "1:X"]);
    await moveBlock(tdb.prisma, coach.id, a.id, 1, 99); // clamped to the end
    expect(await titles(program.id, 1)).toEqual(["0:B", "1:X", "2:A"]);
    expect(await titles(program.id, 0)).toEqual(["0:C"]);
  });

  it("appends duplicated blocks, days and weeks to their target", async () => {
    const { coach, program } = await setup();
    const a = await createBlock(tdb.prisma, coach.id, program.id, 0, custom("A"));
    await createBlock(tdb.prisma, coach.id, program.id, 0, custom("B"));
    await createBlock(tdb.prisma, coach.id, program.id, 3, custom("X"));
    await createBlock(tdb.prisma, coach.id, program.id, 1, custom("Existing"));

    await duplicateBlock(tdb.prisma, coach.id, a.id, 1);
    expect(await titles(program.id, 1)).toEqual(["0:Existing", "1:A"]);

    await duplicateDay(tdb.prisma, coach.id, program.id, 0, 1);
    expect(await titles(program.id, 1)).toEqual(["0:Existing", "1:A", "2:A", "3:B"]);

    await duplicateWeek(tdb.prisma, coach.id, program.id, 0, 2);
    expect(await titles(program.id, 14)).toEqual(["0:A", "1:B"]);
    expect(await titles(program.id, 17)).toEqual(["0:X"]);
    expect(await titles(program.id, 15)).toEqual(["0:Existing", "1:A", "2:A", "3:B"]);
    expect((await listWeekBlocks(tdb.prisma, program.id, 2)).length).toBe(7);
  });

  it("refuses to duplicate or move past the end of a closed program", async () => {
    const coach = await makeCoach(tdb.prisma);
    const closed = await makeClosed(tdb.prisma, coach.id, 2);
    const b = await makeCustomBlock(tdb.prisma, closed.id, 0);
    await expect(duplicateWeek(tdb.prisma, coach.id, closed.id, 0, 2)).rejects.toMatchObject({ code: "day_out_of_range" });
    await expect(duplicateBlock(tdb.prisma, coach.id, b.id, 14)).rejects.toMatchObject({ code: "day_out_of_range" });
    await expect(moveBlock(tdb.prisma, coach.id, b.id, 14, 0)).rejects.toMatchObject({ code: "day_out_of_range" });
  });
});
