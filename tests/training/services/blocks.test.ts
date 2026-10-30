import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeAthlete, makeClosed, makeCoach, makeContinuous, makeCustomBlock, makeResult } from "../../helpers/factories";
import {
  createBlock, deleteBlock, duplicateBlock, duplicateDay, duplicateWeek, importBlocks, listWeekBlocks, moveBlock, updateBlock,
  weeksWithBlocks,
} from "@/lib/training/services/blocks";
import { enroll } from "../../helpers/factories";
import { archiveProgram } from "@/lib/training/services/programs";
import type { BlockInputValue } from "@/lib/training/schemas";
import type { ImportItem, ImportMode } from "@/lib/training/services/blocks";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });

const custom = (title: string, scoring: "for_time" | "amrap" | "none" = "for_time"): BlockInputValue => ({
  kind: "custom", title, color: "neutral", coachingTips: null, videoUrl: null,
  description: "21-15-9", scoring, timeCapSeconds: null,
});
const barbell = (movement = "Test Back Squat"): BlockInputValue => ({
  kind: "barbell", title: null, color: "blue", coachingTips: null, videoUrl: null,
  movement, sets: [{ reps: 5, percent: 80, kg: null }], instructions: null,
});
const titles = async (programId: string, dayIndex: number) =>
  (await tdb.prisma.block.findMany({ where: { programId, dayIndex }, orderBy: { position: "asc" } })).map((b) => `${b.position}:${b.title ?? b.movement}`);

const importItems = (coachId: string, programId: string, items: ImportItem[], mode?: ImportMode) =>
  importBlocks(tdb.prisma, coachId, programId, { items, notes: [] }, mode);

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
    expect(await titles(program.id, 2)).toEqual(["0:A", "1:Test Back Squat"]);
  });

  it("validates the movement, the day and the owner", async () => {
    const { coach, program } = await setup();
    const other = await makeCoach(tdb.prisma);
    const closed = await makeClosed(tdb.prisma, coach.id, 2);
    await expect(createBlock(tdb.prisma, coach.id, program.id, 0, barbell("Test Air Squat"))).rejects.toMatchObject({ code: "invalid_request" });
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
    const updated = await updateBlock(tdb.prisma, coach.id, b.id, barbell("Test Deadlift"));
    expect(updated).toMatchObject({ kind: "barbell", movement: "Test Deadlift", description: null, scoring: null });
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
    await expect(updateBlock(tdb.prisma, coach.id, b.id, { ...custom("A", "for_time"), timeCapSeconds: 600 } as BlockInputValue))
      .rejects.toMatchObject({ code: "scoring_locked" });
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

  it("listWeekBlocks keeps the full count and reports visible results without disabled athletes", async () => {
    const { program } = await setup();
    const block = await makeCustomBlock(tdb.prisma, program.id, 0);
    const active = await makeAthlete(tdb.prisma);
    const disabled = await makeAthlete(tdb.prisma);
    await makeResult(tdb.prisma, block.id, active.id);
    await makeResult(tdb.prisma, block.id, disabled.id);
    const before = (await listWeekBlocks(tdb.prisma, program.id, 0))[0];
    expect([before._count.results, before.visibleResultCount]).toEqual([2, 2]);

    await tdb.prisma.athleteAccount.update({ where: { id: disabled.id }, data: { disabledAt: new Date() } });
    const after = (await listWeekBlocks(tdb.prisma, program.id, 0))[0];
    expect([after._count.results, after.visibleResultCount]).toEqual([2, 1]);
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

describe("duplicating notes", () => {
  const dayNote = async (programId: string, dayIndex: number) =>
    (await tdb.prisma.dayNote.findUnique({ where: { programId_dayIndex: { programId, dayIndex } } }))?.body ?? null;
  const weekNote = async (programId: string, weekIndex: number) =>
    (await tdb.prisma.weekNote.findUnique({ where: { programId_weekIndex: { programId, weekIndex } } }))?.body ?? null;

  it("duplicating a day copies its note over the destination's", async () => {
    const { coach, program } = await setup();
    await tdb.prisma.dayNote.createMany({ data: [{ programId: program.id, dayIndex: 0, body: "Test A" }, { programId: program.id, dayIndex: 7, body: "Test B" }] });
    await duplicateDay(tdb.prisma, coach.id, program.id, 0, 7);
    expect(await dayNote(program.id, 7)).toBe("Test A");
    expect(await dayNote(program.id, 0)).toBe("Test A");
  });

  it("duplicating a day without a note keeps the destination's", async () => {
    const { coach, program } = await setup();
    await tdb.prisma.dayNote.create({ data: { programId: program.id, dayIndex: 7, body: "Test B" } });
    await duplicateDay(tdb.prisma, coach.id, program.id, 0, 7);
    expect(await dayNote(program.id, 7)).toBe("Test B");
  });

  it("duplicating a week copies the week note and each day note", async () => {
    const { coach, program } = await setup();
    await tdb.prisma.weekNote.create({ data: { programId: program.id, weekIndex: 0, body: "Test week" } });
    await tdb.prisma.dayNote.createMany({ data: [{ programId: program.id, dayIndex: 2, body: "Test day" }, { programId: program.id, dayIndex: 24, body: "Test kept" }] });
    await duplicateWeek(tdb.prisma, coach.id, program.id, 0, 3);
    expect(await weekNote(program.id, 3)).toBe("Test week");
    expect(await dayNote(program.id, 23)).toBe("Test day");
    expect(await dayNote(program.id, 24)).toBe("Test kept");
  });
});

describe("deleteBlock fist-bump cleanup", () => {
  it("removes the fist-bump entries of the block's results and keeps others", async () => {
    const coach = await makeCoach(tdb.prisma);
    const p = await makeContinuous(tdb.prisma, coach.id);
    const ana = await makeAthlete(tdb.prisma);
    await enroll(tdb.prisma, p.id, ana.id);
    const a = await makeCustomBlock(tdb.prisma, p.id, 0);
    const b = await makeCustomBlock(tdb.prisma, p.id, 1);
    const ra = await makeResult(tdb.prisma, a.id, ana.id);
    const rb = await makeResult(tdb.prisma, b.id, ana.id);
    for (const r of [ra, rb]) {
      await tdb.prisma.notification.create({
        data: { userId: ana.userId, audience: "athlete", kind: "fist_bump", entityId: r.id, groupKey: `fist_bump:${r.id}`, data: {} },
      });
    }
    await deleteBlock(tdb.prisma, coach.id, a.id);
    expect((await tdb.prisma.notification.findMany()).map((n) => n.entityId)).toEqual([rb.id]);
  });
});

describe("importBlocks", () => {
  it("imports blocks after the existing ones, in order, across days", async () => {
    const { coach, program } = await setup();
    await createBlock(tdb.prisma, coach.id, program.id, 2, custom("A"));
    const count = await importItems(coach.id, program.id, [
      { dayIndex: 2, block: custom("B") }, { dayIndex: 2, block: custom("C") }, { dayIndex: 9, block: custom("D") },
    ]);
    expect(count).toBe(3);
    expect(await titles(program.id, 2)).toEqual(["0:A", "1:B", "2:C"]);
    expect(await titles(program.id, 9)).toEqual(["0:D"]);
  });

  it("creates nothing when any item is invalid", async () => {
    const coach = await makeCoach(tdb.prisma);
    const closed = await makeClosed(tdb.prisma, coach.id, 2);
    await expect(importItems(coach.id, closed.id, [
      { dayIndex: 0, block: custom("A") }, { dayIndex: 14, block: custom("B") },
    ])).rejects.toMatchObject({ code: "day_out_of_range" });
    expect(await tdb.prisma.block.count({ where: { programId: closed.id } })).toBe(0);
  });

  it("creates nothing when a barbell movement is not a lift", async () => {
    const { coach, program } = await setup();
    await expect(importItems(coach.id, program.id, [
      { dayIndex: 0, block: custom("A") }, { dayIndex: 1, block: barbell("Test Air Squat") },
    ])).rejects.toMatchObject({ code: "invalid_request" });
    expect(await tdb.prisma.block.count({ where: { programId: program.id } })).toBe(0);
  });

  it("replaces only the weeks that receive blocks, with their results and fist bumps", async () => {
    const { coach, program } = await setup();
    const ana = await makeAthlete(tdb.prisma);
    await enroll(tdb.prisma, program.id, ana.id);
    const old = await makeCustomBlock(tdb.prisma, program.id, 1);
    await makeCustomBlock(tdb.prisma, program.id, 6);
    await createBlock(tdb.prisma, coach.id, program.id, 7, custom("Kept"));
    const result = await makeResult(tdb.prisma, old.id, ana.id);
    await tdb.prisma.notification.create({
      data: { userId: ana.userId, audience: "athlete", kind: "fist_bump", entityId: result.id, groupKey: `fist_bump:${result.id}`, data: {} },
    });
    await importItems(coach.id, program.id, [{ dayIndex: 1, block: custom("A") }, { dayIndex: 1, block: custom("B") }], "replace");
    expect(await titles(program.id, 1)).toEqual(["0:A", "1:B"]);
    expect(await tdb.prisma.block.count({ where: { programId: program.id, dayIndex: 6 } })).toBe(0);
    expect(await titles(program.id, 7)).toEqual(["0:Kept"]);
    expect(await tdb.prisma.result.count()).toBe(0);
    expect(await tdb.prisma.notification.count({ where: { kind: "fist_bump" } })).toBe(0);
  });

  it("deletes nothing when a replace fails", async () => {
    const { coach, program } = await setup();
    await createBlock(tdb.prisma, coach.id, program.id, 0, custom("Old"));
    await expect(importItems(coach.id, program.id, [
      { dayIndex: 0, block: custom("A") }, { dayIndex: 1, block: barbell("Test Air Squat") },
    ], "replace")).rejects.toMatchObject({ code: "invalid_request" });
    expect(await titles(program.id, 0)).toEqual(["0:Old"]);
  });

  it("refuses another coach's program and archived programs", async () => {
    const { coach, program } = await setup();
    const other = await makeCoach(tdb.prisma);
    const items = [{ dayIndex: 0, block: custom("A") }];
    await expect(importItems(other.id, program.id, items)).rejects.toMatchObject({ code: "not_found" });
    await archiveProgram(tdb.prisma, coach.id, program.id);
    await expect(importItems(coach.id, program.id, items)).rejects.toMatchObject({ code: "program_archived" });
  });
});

describe("importBlocks with notes", () => {
  const dayNote = async (programId: string, dayIndex: number) =>
    (await tdb.prisma.dayNote.findUnique({ where: { programId_dayIndex: { programId, dayIndex } } }))?.body ?? null;
  const weekNote = async (programId: string, weekIndex: number) =>
    (await tdb.prisma.weekNote.findUnique({ where: { programId_weekIndex: { programId, weekIndex } } }))?.body ?? null;

  it("appends imported notes after existing ones", async () => {
    const { coach, program } = await setup();
    await tdb.prisma.dayNote.create({ data: { programId: program.id, dayIndex: 2, body: "Test old" } });
    await tdb.prisma.weekNote.create({ data: { programId: program.id, weekIndex: 0, body: "Test old week" } });
    const count = await importBlocks(tdb.prisma, coach.id, program.id, {
      items: [{ dayIndex: 2, block: custom("A") }],
      notes: [{ scope: "day", index: 2, text: "Test new" }, { scope: "week", index: 0, text: "Test new week" }],
    });
    expect(count).toBe(3);
    expect(await dayNote(program.id, 2)).toBe("Test old\n\nTest new");
    expect(await weekNote(program.id, 0)).toBe("Test old week\n\nTest new week");
    expect(await titles(program.id, 2)).toEqual(["0:A"]);
  });

  it("joins several imported notes for one day in order", async () => {
    const { coach, program } = await setup();
    await importBlocks(tdb.prisma, coach.id, program.id, {
      items: [],
      notes: [
        { scope: "day", index: 9, text: "Test one" }, { scope: "week", index: 1, text: "Test week" },
        { scope: "day", index: 9, text: "Test two" },
      ],
    });
    expect(await dayNote(program.id, 9)).toBe("Test one\n\nTest two");
    expect(await weekNote(program.id, 1)).toBe("Test week");
  });

  it("replace deletes the replaced weeks' notes", async () => {
    const { coach, program } = await setup();
    await createBlock(tdb.prisma, coach.id, program.id, 0, custom("Old"));
    await tdb.prisma.weekNote.createMany({ data: [{ programId: program.id, weekIndex: 0, body: "Test old week" }, { programId: program.id, weekIndex: 1, body: "Test kept week" }] });
    await tdb.prisma.dayNote.createMany({ data: [{ programId: program.id, dayIndex: 3, body: "Test old day" }, { programId: program.id, dayIndex: 8, body: "Test kept day" }] });
    await importBlocks(tdb.prisma, coach.id, program.id, {
      items: [{ dayIndex: 0, block: custom("A") }],
      notes: [{ scope: "day", index: 1, text: "Test new" }],
    }, "replace");
    expect(await titles(program.id, 0)).toEqual(["0:A"]);
    expect(await weekNote(program.id, 0)).toBeNull();
    expect(await dayNote(program.id, 3)).toBeNull();
    expect(await dayNote(program.id, 1)).toBe("Test new");
    expect(await weekNote(program.id, 1)).toBe("Test kept week");
    expect(await dayNote(program.id, 8)).toBe("Test kept day");
  });

  it("a week that receives only notes keeps its blocks in replace mode", async () => {
    const { coach, program } = await setup();
    await createBlock(tdb.prisma, coach.id, program.id, 7, custom("Kept"));
    await tdb.prisma.dayNote.create({ data: { programId: program.id, dayIndex: 8, body: "Test old" } });
    await importBlocks(tdb.prisma, coach.id, program.id, {
      items: [{ dayIndex: 0, block: custom("A") }],
      notes: [{ scope: "day", index: 8, text: "Test new" }],
    }, "replace");
    expect(await titles(program.id, 7)).toEqual(["0:Kept"]);
    expect(await dayNote(program.id, 8)).toBe("Test old\n\nTest new");
  });

  it("refuses joined notes over 2000 chars and writes nothing", async () => {
    const { coach, program } = await setup();
    await createBlock(tdb.prisma, coach.id, program.id, 0, custom("Old"));
    await tdb.prisma.dayNote.create({ data: { programId: program.id, dayIndex: 2, body: "x".repeat(1500) } });
    await expect(importBlocks(tdb.prisma, coach.id, program.id, {
      items: [{ dayIndex: 1, block: custom("A") }],
      notes: [{ scope: "week", index: 0, text: "Test week" }, { scope: "day", index: 2, text: "y".repeat(499) }],
    })).rejects.toMatchObject({ code: "note_too_long", issues: ["day:2"] });
    expect(await tdb.prisma.block.count({ where: { programId: program.id } })).toBe(1);
    expect(await dayNote(program.id, 2)).toBe("x".repeat(1500));
    expect(await weekNote(program.id, 0)).toBeNull();
  });

  it("refuses a single imported note over 2000 chars and writes nothing", async () => {
    const { coach, program } = await setup();
    await expect(importBlocks(tdb.prisma, coach.id, program.id, {
      items: [{ dayIndex: 5, block: custom("A") }], notes: [{ scope: "day", index: 5, text: "x".repeat(2001) }],
    })).rejects.toMatchObject({ code: "note_too_long", issues: ["day:5"] });
    expect(await tdb.prisma.block.count({ where: { programId: program.id } })).toBe(0);
    expect(await tdb.prisma.dayNote.count()).toBe(0);
  });

  it("names the week when a week note would be too long", async () => {
    const { coach, program } = await setup();
    await expect(importBlocks(tdb.prisma, coach.id, program.id, {
      items: [],
      notes: [{ scope: "week", index: 4, text: "x".repeat(1000) }, { scope: "week", index: 4, text: "y".repeat(1000) }],
    })).rejects.toMatchObject({ code: "note_too_long", issues: ["week:4"] });
    expect(await tdb.prisma.weekNote.count()).toBe(0);
  });

  it("refuses notes outside a closed program", async () => {
    const coach = await makeCoach(tdb.prisma);
    const closed = await makeClosed(tdb.prisma, coach.id, 2);
    await expect(importBlocks(tdb.prisma, coach.id, closed.id, {
      items: [{ dayIndex: 0, block: custom("A") }], notes: [{ scope: "day", index: 14, text: "Test day" }],
    })).rejects.toMatchObject({ code: "day_out_of_range" });
    await expect(importBlocks(tdb.prisma, coach.id, closed.id, {
      items: [], notes: [{ scope: "week", index: 2, text: "Test week" }],
    })).rejects.toMatchObject({ code: "day_out_of_range" });
    expect(await tdb.prisma.block.count({ where: { programId: closed.id } })).toBe(0);
    expect(await tdb.prisma.weekNote.count()).toBe(0);
  });
});

describe("weeksWithBlocks", () => {
  it("lists each week that holds a block, once, in order", async () => {
    const { coach, program } = await setup();
    for (const day of [15, 0, 6, 15]) await createBlock(tdb.prisma, coach.id, program.id, day, custom("A"));
    expect(await weeksWithBlocks(tdb.prisma, program.id)).toEqual([0, 2]);
  });
});
