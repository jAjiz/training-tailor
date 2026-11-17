import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { createTestDb, type TestDb } from "../../helpers/db";
import { makeBarbellBlock, makeCoach, makeContinuous, makeCustomBlock } from "../../helpers/factories";
import { coupletDraft, fixtureDomain } from "../../fixtures/workouts";
import { FakeProvider, sequence } from "@/lib/ai/fake-provider";
import { ensureBlockAnalysis } from "@/lib/training/services/block-analysis";

let tdb: TestDb;
beforeAll(async () => { tdb = await createTestDb(); }, 60_000);
afterAll(async () => { await tdb.close(); });
beforeEach(async () => { await tdb.reset(); });
afterEach(() => { vi.restoreAllMocks(); });

const domain = fixtureDomain();
const provider = () => new FakeProvider({ BlockAnalysis: coupletDraft() });

async function setup() {
  const coach = await makeCoach(tdb.prisma);
  const program = await makeContinuous(tdb.prisma, coach.id);
  return { program, block: await makeCustomBlock(tdb.prisma, program.id, 0) };
}
const reload = (id: string) => tdb.prisma.block.findUniqueOrThrow({ where: { id } });
const ensure = async (p: FakeProvider, id: string, version = 1) =>
  ensureBlockAnalysis(tdb.prisma, p, await reload(id), domain, version, "en");

describe("ensureBlockAnalysis", () => {
  it("analyzes once and reuses", async () => {
    const { block } = await setup();
    const p = provider();
    const first = await ensure(p, block.id);
    const second = await ensure(p, block.id);
    expect(p.calls).toHaveLength(1);
    expect(first).toMatchObject({ analyzed: true, fresh: true });
    expect(second).toMatchObject({ analyzed: true, fresh: false });
    expect(second.workout).toEqual(first.workout);
    expect((await tdb.prisma.blockAnalysis.findUniqueOrThrow({ where: { blockId: block.id } })).model).toBe("fake");
  });

  it("re-analyzes after a description edit", async () => {
    const { block } = await setup();
    const p = provider();
    await ensure(p, block.id);
    await tdb.prisma.block.update({ where: { id: block.id }, data: { description: "Test edited description" } });
    expect((await ensure(p, block.id)).fresh).toBe(true);
    expect(p.calls).toHaveLength(2);
  });

  it("re-analyzes after a tips-only edit", async () => {
    const { block } = await setup();
    const p = provider();
    await ensure(p, block.id);
    await tdb.prisma.block.update({ where: { id: block.id }, data: { coachingTips: "Test tip" } });
    expect((await ensure(p, block.id)).fresh).toBe(true);
    expect(p.calls).toHaveLength(2);
  });

  it("keeps the analysis when the block moves day", async () => {
    const { block } = await setup();
    const p = provider();
    await ensure(p, block.id);
    await tdb.prisma.block.update({ where: { id: block.id }, data: { dayIndex: 3, position: 2 } });
    expect((await ensure(p, block.id)).fresh).toBe(false);
    expect(p.calls).toHaveLength(1);
  });

  it("re-analyzes after a new library version", async () => {
    const { block } = await setup();
    const p = provider();
    await ensure(p, block.id, 1);
    expect((await ensure(p, block.id, 2)).fresh).toBe(true);
    expect(p.calls).toHaveLength(2);
    expect((await tdb.prisma.blockAnalysis.findUniqueOrThrow({ where: { blockId: block.id } })).libraryVersion).toBe(2);
  });

  it("forces the movement of a barbell block", async () => {
    const { program } = await setup();
    const barbell = await makeBarbellBlock(tdb.prisma, program.id, 1, "Test Back Squat");
    const draft = coupletDraft();
    draft.blocks[0].components[0].percent1RM = 80;
    const p = new FakeProvider({ BlockAnalysis: draft });
    const { workout } = await ensure(p, barbell.id);
    expect(workout.blocks[0].components[0].canonical).toBe("Test Back Squat");
  });

  it("retries a degraded analysis on the next call", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { block } = await setup();
    const p = new FakeProvider({ BlockAnalysis: sequence(new Error("Test outage"), coupletDraft()) });
    expect(await ensure(p, block.id)).toMatchObject({ analyzed: false, fresh: true });
    const retried = await ensure(p, block.id);
    expect(retried).toMatchObject({ analyzed: true, fresh: true });
    expect(p.calls).toHaveLength(2);
    expect((await tdb.prisma.blockAnalysis.findUniqueOrThrow({ where: { blockId: block.id } })).analyzed).toBe(true);
  });

  it("keeps the scoring's format on a degraded analysis", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = await setup();
    const forTime = await makeCustomBlock(tdb.prisma, program.id, 1, { scoring: "for_time" });
    const reps = await makeCustomBlock(tdb.prisma, program.id, 2, { scoring: "reps" });
    const p = new FakeProvider({ BlockAnalysis: new Error("Test outage") });
    expect((await ensure(p, forTime.id)).workout.blocks[0].format).toBe("for_time");
    expect((await ensure(p, reps.id)).workout.blocks[0].format).toBe("other");
  });
});
